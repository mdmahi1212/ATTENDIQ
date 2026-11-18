import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type Admin = ReturnType<typeof createAdminClient>;

export function policyNum(policy: unknown, key: string, fallback: number): number {
  const v = (policy as Record<string, unknown> | null)?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/** True when the signed-in user is staff of the session (or admin): asks the DB (assert_session_actor). */
export async function isSessionStaff(sessionId: string): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("assert_session_actor", { p_session: sessionId });
  return !error;
}

export type RequestContext = {
  request: { id: string; session_id: string; kind: string; status: string; opens_at: string; closes_at: string };
  session: { id: string; room_id: string | null; state: string; policy: unknown; starts_at: string; ends_at: string; section_id: string };
  requireQr: boolean;
  targeted: boolean;
  passed: boolean;
  attempts: number;
  eligible: boolean;
};

/** Everything the verify page and route need, read with the service role AFTER the caller is known. */
export async function loadRequestContext(admin: Admin, requestId: string, studentId: string): Promise<RequestContext | null> {
  const { data: req } = await admin
    .from("verification_requests")
    .select("id, session_id, kind, status, opens_at, closes_at")
    .eq("id", requestId)
    .maybeSingle();
  if (!req) return null;
  const { data: session } = await admin
    .from("class_sessions")
    .select("id, room_id, state, policy, starts_at, ends_at, section_id, rooms(require_qr)")
    .eq("id", req.session_id)
    .single();
  if (!session) return null;
  const [{ data: target }, { count }, { data: att }] = await Promise.all([
    admin.from("verification_targets").select("passed_at").eq("request_id", requestId).eq("student_id", studentId).maybeSingle(),
    admin.from("verification_attempts").select("id", { count: "exact", head: true }).eq("request_id", requestId).eq("student_id", studentId),
    admin.from("attendance").select("status").eq("session_id", req.session_id).eq("student_id", studentId).maybeSingle(),
  ]);
  const targeted = !!target;
  // Same rule as apply_self_verification: targets, or (non-recheck) students still pending in the session.
  const eligible = targeted || (req.kind !== "recheck" && att?.status === "pending");
  const { rooms, ...s } = session;
  return {
    request: req,
    session: s,
    requireQr: rooms?.require_qr ?? true,
    targeted,
    passed: !!target?.passed_at,
    attempts: count ?? 0,
    eligible,
  };
}

export function windowOpen(req: { status: string; opens_at: string; closes_at: string }, nowMs: number): boolean {
  return req.status === "open" && nowMs >= Date.parse(req.opens_at) && nowMs <= Date.parse(req.closes_at);
}
