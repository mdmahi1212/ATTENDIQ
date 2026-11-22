import "server-only";
import type { Json } from "@/lib/database.types";
import { fullClassMinutes, withDemoPolicy } from "@/lib/demo";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Starts a real (non-simulated) class NOW for a section in a room (service role). Short lengths (5-15 min) run the
 * rules on the demo clock and count no professor (staff_count 0); "full" is a normal class with the normal rules.
 * Used by Admin -> Demo and by the laptop's one-click demo (edge route). Returns the new session id and length.
 */
export async function startDemoClass(
  admin: Admin,
  { sectionId, roomId, length }: { sectionId: string; roomId: string; length: number | "full" },
): Promise<{ sessionId: string; minutes: number }> {
  let minutes = length === "full" ? 0 : length;
  if (length === "full") {
    const { data: slots, error } = await admin.from("timetable_slots").select("start_time, end_time").eq("section_id", sectionId);
    if (error) throw new Error(error.message);
    minutes = fullClassMinutes(slots ?? []);
  }
  const { data: id, error } = await admin.rpc("create_adhoc_session", {
    p_room: roomId,
    p_section: sectionId,
    p_starts_at: new Date().toISOString(),
    p_minutes: minutes,
    p_simulation: false,
  });
  if (error) throw new Error(error.message);
  const sessionId = String(id);
  if (length !== "full") {
    const { data: s, error: e1 } = await admin.from("class_sessions").select("policy").eq("id", sessionId).single();
    if (e1) throw new Error(e1.message);
    // staff_count 0: no professor walks through a short demo, so every person the room camera counts is a student.
    const { error: e2 } = await admin
      .from("class_sessions")
      .update({ policy: withDemoPolicy(s.policy, minutes) as Json, staff_count: 0 })
      .eq("id", sessionId);
    if (e2) throw new Error(e2.message);
  }
  return { sessionId, minutes };
}
