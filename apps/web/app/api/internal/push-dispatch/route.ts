import { NextResponse, type NextRequest } from "next/server";
import { sendNotification, WebPushError } from "web-push";
import { z } from "zod";
import { buildPayload, isGoneStatus, ttlSeconds, urgencyFor } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";
import { secretsMatch } from "@/lib/webhook-auth";

// web-push needs Node crypto + https: never the edge runtime.
export const runtime = "nodejs";

const bodySchema = z.object({ notification_id: z.guid() });

/**
 * Called by the Postgres trigger `dispatch_push` (pg_net) for every notifications insert.
 * Header X-Webhook-Secret must equal PUSH_WEBHOOK_SECRET (same value stored in private.app_config).
 * Fans the notification out to every push subscription of the user; deletes 404/410 subscriptions.
 */
export async function POST(request: NextRequest) {
  if (!secretsMatch(request.headers.get("x-webhook-secret"), process.env.PUSH_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    return NextResponse.json({ error: "VAPID keys not configured" }, { status: 500 });
  }

  const admin = createAdminClient();
  const { data: n } = await admin
    .from("notifications")
    .select("id, user_id, type, title, body, data, expires_at")
    .eq("id", parsed.data.notification_id)
    .maybeSingle();
  if (!n) return NextResponse.json({ error: "not found" }, { status: 404 });

  const ttl = ttlSeconds(n.expires_at);
  if (ttl === 0) return NextResponse.json({ sent: 0, skipped: "expired" });

  const { data: subs } = await admin.from("push_subscriptions").select("id, endpoint, keys").eq("user_id", n.user_id);
  const payload = JSON.stringify(buildPayload(n));
  let sent = 0;
  const gone: string[] = [];
  const failed: { status?: number; message: string }[] = [];

  await Promise.all(
    (subs ?? []).map(async (s) => {
      const keys = s.keys as { p256dh?: string; auth?: string } | null;
      if (!keys?.p256dh || !keys.auth) {
        gone.push(s.id);
        return;
      }
      try {
        await sendNotification({ endpoint: s.endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } }, payload, {
          TTL: ttl,
          urgency: urgencyFor(n.type),
          vapidDetails: { subject, publicKey, privateKey },
          timeout: 10_000,
        });
        sent += 1;
      } catch (e) {
        const status = e instanceof WebPushError ? e.statusCode : undefined;
        if (isGoneStatus(status)) gone.push(s.id);
        else failed.push({ status, message: e instanceof Error ? e.message.slice(0, 200) : "send failed" });
      }
    }),
  );

  if (gone.length) await admin.from("push_subscriptions").delete().in("id", gone);
  return NextResponse.json({ sent, removed: gone.length, failed });
}
