"use server";

import { z } from "zod";
import { check, formAction } from "@/lib/admin-action";
import { endStep } from "@/lib/final-check";

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

/**
 * End session (user decision 2026-11-24): first a final room check (the edge looks at the room ~30 s: people count
 * over many frames + recognised faces + body names) so the professor sees who is really there; pressing again
 * (after the result, or with "End now") closes the class. Without a room camera online it closes straight away.
 */
export const endSession = formAction({
  roles: ["professor", "admin"],
  schema: sessionId.extend({ now: z.enum(["0", "1"]).default("0") }),
  revalidate: "/sessions",
  run: async ({ session_id, now }, { supabase }) => {
    if (now === "0") {
      const { data: s } = check(
        await supabase.from("class_sessions").select("state, room_id, final_check_requested_at, final_check_at").eq("id", session_id).single(),
      );
      if (!s) return { ok: false, message: "Class not found." };
      const step = endStep(s.final_check_requested_at, s.final_check_at, Date.now());
      if (s.state !== "ended" && step !== "close" && (await roomCameraOnline(s.room_id))) {
        if (step === "check") check(await supabase.rpc("request_final_check", { p_session: session_id }));
        return "Final room check running (about 40 s): the room camera counts and recognises everyone. The result appears on this page; then press End session again.";
      }
    }
    const { data } = check(await supabase.rpc("finalize_session", { p_session: session_id }));
    const r = data as { finalized?: boolean; absent?: number; needs_review?: number; unconfirmed?: number; reason?: string } | null;
    if (!r?.finalized) return { ok: false, message: `Not finalized (${r?.reason ?? "unknown"}).` };
    return `Session ended: ${r.absent ?? 0} absent, ${r.needs_review ?? 0} need review, ${r.unconfirmed ?? 0} not seen in the room.`;
  },
});

/** The room's edge sent a heartbeat in the last minute (it can run a final room check). */
async function roomCameraOnline(roomId: string | null): Promise<boolean> {
  if (!roomId) return false;
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { data } = await createAdminClient().from("edge_devices").select("last_seen").eq("room_id", roomId).eq("kind", "edge").eq("is_active", true);
  return (data ?? []).some((d) => d.last_seen && Date.now() - Date.parse(d.last_seen) < 60_000);
}

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

/** #5: write (or rewrite) the class summary for the professor; Claude when configured, else a template. */
export const writeClassSummary = formAction({
  roles: ["professor", "admin"],
  schema: sessionId,
  revalidate: "/sessions",
  run: async ({ session_id }, { supabase }) => {
    const { buildClassFacts } = await import("@/lib/class-facts");
    const { writeSummary } = await import("@/lib/class-summary-ai");
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const facts = await buildClassFacts(supabase, session_id); // RLS: only this class's staff can read it
    if (!facts) return { ok: false, message: "Class not found or not ended yet." };
    const s = await writeSummary(facts);
    check(
      await createAdminClient()
        .from("class_sessions")
        .update({ summary: s.text, summary_at: new Date().toISOString() })
        .eq("id", session_id),
    );
    return s.by === "claude" ? "Summary written by Claude." : "Summary written (plain version: no AI key set on the server).";
  },
});
