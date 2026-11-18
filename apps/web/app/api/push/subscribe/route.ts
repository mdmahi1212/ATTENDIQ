import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { pushSubscriptionSchema } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

async function currentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return data?.claims?.sub ?? null;
}

/** Save this browser's push subscription for the signed-in user. */
export async function POST(request: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = z
    .object({ subscription: pushSubscriptionSchema, userAgent: z.string().max(400).optional() })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid subscription" }, { status: 400 });
  const { subscription, userAgent } = parsed.data;

  // An endpoint is unique per browser profile. If another account used this browser before,
  // the endpoint moves to the current user (service role: RLS would hide the other user's row).
  const admin = createAdminClient();
  const { error } = await admin.from("push_subscriptions").upsert(
    {
      user_id: userId,
      endpoint: subscription.endpoint,
      keys: subscription.keys,
      user_agent: userAgent ?? request.headers.get("user-agent")?.slice(0, 400) ?? null,
    },
    { onConflict: "endpoint" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** Remove this browser's subscription (own rows only, via RLS). */
export async function DELETE(request: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = z.object({ endpoint: z.string().url().max(2048) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const supabase = await createClient();
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", parsed.data.endpoint).eq("user_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
