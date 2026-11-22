import type { NextRequest } from "next/server";
import { z } from "zod";
import { json, requireDevice } from "@/lib/edge/route-helpers";
import { replaySessionsEnabled } from "@/lib/edge/schemas";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Ends + finalizes a recorded-video class that THIS device started (POST /sessions/replay), then returns the final
 * statuses with names so the presenter sees the result in the console. Any other session: 404.
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/edge/v1/sessions/[id]/end">) {
  if (!replaySessionsEnabled()) return json({ error: "replay sessions are disabled (EDGE_REPLAY_SESSIONS)" }, 403);
  const device = await requireDevice(request, ["edge"]);
  if (device instanceof Response) return device;
  const { id } = await ctx.params;
  if (!z.guid().safeParse(id).success) return json({ error: "bad session id" }, 400);
  const admin = createAdminClient();

  const { data: s } = await admin.from("class_sessions").select("id, state, room_id").eq("id", id).maybeSingle();
  const { data: marker } = await admin.from("audit_log").select("id").eq("action", "replay_start")
    .eq("entity_id", id).eq("after->>device_id", device.id).limit(1).maybeSingle();
  if (!s || s.room_id !== device.room_id || !marker) return json({ error: "not found" }, 404);

  let finalize: unknown = { finalized: false, reason: "already ended" };
  if (s.state === "live" || s.state === "recheck") {
    const { data, error } = await admin.rpc("finalize_session", { p_session: id });
    if (error) return json({ error: error.message }, 400);
    finalize = data;
  }
  const [{ data: att }, { count: unknown }] = await Promise.all([
    admin.from("attendance").select("status, flags, note, profiles!attendance_student_id_fkey!inner(full_name, student_no)").eq("session_id", id),
    admin.from("gate_events").select("*", { count: "exact", head: true }).eq("session_id", id).eq("event_type", "GATE_ENTRY_UNKNOWN"),
  ]);
  const attendance = (att ?? []).map((a) => ({
    name: a.profiles.full_name || a.profiles.student_no || "?", status: a.status, flags: a.flags, note: a.note,
  }));
  console.log(JSON.stringify({ at: "edge.replay-end", device: device.name, session: id }));
  return json({ finalize, unknown_entries: unknown ?? 0, attendance });
}
