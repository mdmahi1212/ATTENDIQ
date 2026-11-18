import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { json, requireDevice } from "@/lib/edge/route-helpers";
import { heartbeatSchema, type RpcBatchResult } from "@/lib/edge/schemas";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/** POST { status: {cpu, fps, frame_age_s, outbox, ...} } -> stored as an EDGE_HEARTBEAT event (device status). */
export async function POST(request: NextRequest) {
  const device = await requireDevice(request, ["edge", "ingest", "simulator"]);
  if (device instanceof Response) return device;
  const parsed = heartbeatSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return json({ error: "bad heartbeat" }, 400);
  const event = {
    event_id: randomUUID(),
    event_type: "EDGE_HEARTBEAT",
    source_device_id: device.id,
    session_id: null,
    observed_at: parsed.data.observed_at ?? new Date().toISOString(),
    payload: parsed.data.status,
    simulation: device.kind === "simulator",
  };
  const { data, error } = await createAdminClient().rpc("apply_edge_events", { p_device: device.id, p_events: [event] as never });
  if (error) return json({ error: "could not store heartbeat" }, 500);
  const r = data as RpcBatchResult;
  return json({ ok: r.accepted === 1, rejected: r.rejected });
}
