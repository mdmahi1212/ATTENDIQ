import type { NextRequest } from "next/server";
import { z } from "zod";
import { json, requireDevice } from "@/lib/edge/route-helpers";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Simulator only: final state of a SIMULATION session in the simulator's room (statuses of simulated students),
 * so the Gate 7 test can assert the whole scripted class. Real sessions are never exposed here.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/edge/v1/sessions/[id]/results">) {
  const device = await requireDevice(request, ["simulator"]);
  if (device instanceof Response) return device;
  const { id } = await ctx.params;
  if (!z.guid().safeParse(id).success) return json({ error: "bad session id" }, 400);
  const admin = createAdminClient();
  const { data: s } = await admin.from("class_sessions").select("id, state, is_simulation, room_id, finalized_at").eq("id", id).maybeSingle();
  if (!s || !s.is_simulation || s.room_id !== device.room_id) return json({ error: "not found" }, 404);
  const [{ data: att }, { count: unknown }] = await Promise.all([
    admin.from("attendance").select("student_id, status, method, flags").eq("session_id", id),
    admin.from("gate_events").select("*", { count: "exact", head: true }).eq("session_id", id).eq("event_type", "GATE_ENTRY_UNKNOWN"),
  ]);
  return json({ state: s.state, finalized_at: s.finalized_at, unknown_entries: unknown ?? 0, attendance: att ?? [] });
}
