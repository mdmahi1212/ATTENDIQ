import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { makeQrToken } from "@/lib/verify/qr";
import { isSessionStaff, policyNum } from "@/lib/verify/server";

export const runtime = "nodejs";

/** Current rotating room QR token for the projector (session staff / admin only). */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/sessions/[id]/qr">) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "professor" && user.role !== "admin")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  if (!z.guid().safeParse(id).success) return NextResponse.json({ error: "bad id" }, { status: 400 });
  if (!(await isSessionStaff(id))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const admin = createAdminClient();
  const [{ data: session }, { data: secret }] = await Promise.all([
    admin.from("class_sessions").select("state, policy").eq("id", id).maybeSingle(),
    admin.from("session_secrets").select("qr_secret").eq("session_id", id).maybeSingle(),
  ]);
  if (!session || !secret) return NextResponse.json({ error: "session has no QR (not started)" }, { status: 404 });
  if (session.state !== "live" && session.state !== "recheck") return NextResponse.json({ error: "session is not live" }, { status: 409 });
  const slotSeconds = policyNum(session.policy, "qr_slot_seconds", 20);
  const now = Date.now();
  const { token, expiresAt } = makeQrToken(secret.qr_secret, id, now, slotSeconds);
  return NextResponse.json(
    { token, expires_at: expiresAt.toISOString(), slot_seconds: slotSeconds, server_now: new Date(now).toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
