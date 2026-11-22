import type { NextRequest } from "next/server";
import { json, requireDevice } from "@/lib/edge/route-helpers";
import { DEMO_POLICY, replaySessionSchema, replaySessionsEnabled } from "@/lib/edge/schemas";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Recorded-video presentation (edge only, off unless EDGE_REPLAY_SESSIONS=true): starts a REAL ad-hoc class in the
 * device's room at the moment the videos start. Real students get attendance rows and notifications, exactly like a
 * live class. The edge ends it with POST /sessions/{id}/end when the videos finish.
 */
export async function POST(request: NextRequest) {
  if (!replaySessionsEnabled()) return json({ error: "replay sessions are disabled (EDGE_REPLAY_SESSIONS)" }, 403);
  const device = await requireDevice(request, ["edge"]);
  if (device instanceof Response) return device;
  const parsed = replaySessionSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return json({ error: "bad request", issues: parsed.error.issues.map((i) => i.message) }, 400);
  const admin = createAdminClient();

  const { data: sections, error: secErr } = await admin
    .from("sections")
    .select("id, section_no, courses!inner(code), enrollments(student_id, profiles!inner(is_simulated, face_profiles(status)))")
    .eq("room_id", device.room_id!);
  if (secErr) return json({ error: "section lookup failed" }, 500);
  const rows = (sections ?? []).map((s) => ({
    id: s.id,
    name: `${s.courses.code}-${s.section_no}`,
    faces: s.enrollments.filter((e) => !e.profiles.is_simulated && e.profiles.face_profiles?.status === "active").length,
  }));
  const want = parsed.data.section?.toUpperCase();
  const section = want ? rows.find((r) => r.name.toUpperCase() === want) : rows.sort((a, b) => b.faces - a.faces)[0];
  if (!section) return json({ error: want ? `section ${want} is not in this room` : "no section in this room" }, 404);

  const { data: id, error } = await admin.rpc("create_adhoc_session", {
    p_room: device.room_id!,
    p_section: section.id,
    p_starts_at: new Date().toISOString(),
    p_minutes: parsed.data.minutes,
    p_simulation: false,
  });
  if (error) return json({ error: error.message }, error.code === "55000" ? 409 : 400);
  // The session already holds the global policy (merged at start); demo timing overrides only the time windows.
  const { data: started } = await admin.from("class_sessions").select("policy").eq("id", String(id)).single();
  const policy = { ...((started?.policy as Record<string, unknown> | null) ?? {}), ...(parsed.data.demo_timing ? DEMO_POLICY : {}) };
  const { error: updErr } = await admin.from("class_sessions")
    .update({ policy, staff_count: parsed.data.staff_count }).eq("id", String(id));
  if (updErr) return json({ error: "could not apply demo settings" }, 500);
  // Marker that THIS device started the class: only then may it end it (POST /sessions/{id}/end).
  await admin.from("audit_log").insert({
    action: "replay_start", entity: "class_sessions", entity_id: String(id),
    after: { device_id: device.id, section: section.name, minutes: parsed.data.minutes, demo_timing: parsed.data.demo_timing,
             staff_count: parsed.data.staff_count },
    reason: "recorded video replay",
  });
  console.log(JSON.stringify({ at: "edge.replay-session", device: device.name, session: id, section: section.name }));
  return json({ session_id: id, section: section.name, students_with_face: section.faces,
                demo_timing: parsed.data.demo_timing ? DEMO_POLICY : null }, 201);
}
