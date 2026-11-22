"use server";

import { z } from "zod";
import { check, formAction } from "@/lib/admin-action";

const sessionId = z.object({ session_id: z.guid() });

/** Push "verify now" to every student still pending (kind 'manual' = started by the professor). */
export const sendVerifyRequest = formAction({
  roles: ["professor", "admin"],
  schema: sessionId,
  revalidate: "/sessions",
  run: async ({ session_id }, { supabase }) => {
    check(await supabase.rpc("open_verification_request", { p_session: session_id, p_kind: "manual" }));
    return "Verify request sent to all pending students.";
  },
});

export const startRecheck = formAction({
  roles: ["professor", "admin"],
  schema: sessionId,
  revalidate: "/sessions",
  run: async ({ session_id }, { supabase }) => {
    check(await supabase.rpc("open_verification_request", { p_session: session_id, p_kind: "recheck" }));
    return "Recheck started: present students must confirm within the window.";
  },
});

export const endSession = formAction({
  roles: ["professor", "admin"],
  schema: sessionId,
  revalidate: "/sessions",
  run: async ({ session_id }, { supabase }) => {
    const { data } = check(await supabase.rpc("finalize_session", { p_session: session_id }));
    const r = data as { finalized?: boolean; absent?: number; needs_review?: number; unconfirmed?: number; reason?: string } | null;
    if (!r?.finalized) return { ok: false, message: `Not finalized (${r?.reason ?? "unknown"}).` };
    return `Session ended: ${r.absent ?? 0} absent, ${r.needs_review ?? 0} need review, ${r.unconfirmed ?? 0} not seen in the room.`;
  },
});

export const manualMark = formAction({
  roles: ["professor", "admin"],
  schema: z.object({
    session_id: z.guid(),
    student_id: z.guid(),
    status: z.enum(["present", "late", "absent", "excused", "left_early"]),
    reason: z.string().trim().min(3, "Give a reason (min 3 characters)").max(300),
  }),
  revalidate: "/sessions",
  run: async ({ session_id, student_id, status, reason }, { supabase }) => {
    check(await supabase.rpc("manual_mark", { p_session: session_id, p_student: student_id, p_status: status, p_reason: reason }));
    return `Marked ${status}.`;
  },
});
