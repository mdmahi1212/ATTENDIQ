import type { NextRequest } from "next/server";
import { json, requireDevice } from "@/lib/edge/route-helpers";
import { demoSessionSchema } from "@/lib/edge/schemas";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Simulator only: creates + starts a SIMULATION session in the simulator's room (replacing an older one).
 * Only simulated students get attendance rows, so real students are never notified.
 */
export async function POST(request: NextRequest) {
  const device = await requireDevice(request, ["simulator"]);
  if (device instanceof Response) return device;
  const parsed = demoSessionSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return json({ error: "bad request", issues: parsed.error.issues.map((i) => i.message) }, 400);
  const admin = createAdminClient();

  let section = parsed.data.section_id;
  if (!section) {
    // The room's section with the most simulated students enrolled.
    const { data } = await admin
      .from("sections")
      .select("id, enrollments(student_id, profiles!inner(is_simulated))")
      .eq("room_id", device.room_id!)
      .eq("enrollments.profiles.is_simulated", true);
    section = (data ?? []).map((s) => ({ id: s.id, n: s.enrollments.length })).sort((a, b) => b.n - a.n)[0]?.id;
  }
  if (!section) return json({ error: "no section in this room" }, 404);

  const startsAt = new Date(Date.now() - parsed.data.started_minutes_ago * 60_000).toISOString();
  const { data: id, error } = await admin.rpc("create_adhoc_session", {
    p_room: device.room_id!,
    p_section: section,
    p_starts_at: startsAt,
    p_minutes: parsed.data.minutes,
    p_simulation: true,
  });
  if (error) return json({ error: error.message }, 400);
  const { data: session } = await admin.rpc("current_session_for_room", { p_room: device.room_id! });
  console.log(JSON.stringify({ at: "edge.demo-session", device: device.name, session: id }));
  return json({ session_id: id, session }, 201);
}
