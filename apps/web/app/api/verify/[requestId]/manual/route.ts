import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadRequestContext } from "@/lib/verify/server";

export const runtime = "nodejs";

/** "Request manual check": flags the student's row and notifies the session staff (review queue). */
export async function POST(_request: NextRequest, ctx: RouteContext<"/api/verify/[requestId]/manual">) {
  const user = await getCurrentUser();
  if (!user || user.role !== "student") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const { requestId } = await ctx.params;
  if (!z.guid().safeParse(requestId).success) return NextResponse.json({ ok: false, error: "bad id" }, { status: 400 });
  const admin = createAdminClient();
  const rc = await loadRequestContext(admin, requestId, user.id);
  if (!rc || !rc.eligible) return NextResponse.json({ ok: false, error: "not allowed" }, { status: 403 });
  if (rc.passed) return NextResponse.json({ ok: false, error: "You already verified." }, { status: 409 });
  await admin.rpc("add_attendance_flag", { p_session: rc.session.id, p_student: user.id, p_flag: "manual_check" });
  await admin.rpc("notify_session_staff", {
    p_session: rc.session.id,
    p_type: "manual_check",
    p_title: "Manual check requested",
    p_body: `${user.fullName} could not self-verify and asks for a manual check.`,
    p_data: { url: `/sessions/${rc.session.id}`, session_id: rc.session.id, student_id: user.id },
  });
  return NextResponse.json({ ok: true });
}
