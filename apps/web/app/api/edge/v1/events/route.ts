import type { NextRequest } from "next/server";
import { json, requireDevice } from "@/lib/edge/route-helpers";
import { eventBatchSchema, type RpcBatchResult } from "@/lib/edge/schemas";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/** POST a batch (<= 500) of event envelopes -> { accepted, duplicates, rejected[] }. Idempotent by event_id. */
export async function POST(request: NextRequest) {
  const device = await requireDevice(request, ["ingest", "edge", "simulator"]);
  if (device instanceof Response) return device;
  const parsed = eventBatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "body must be an array of at most 500 event envelopes" }, 400);
  if (parsed.data.length === 0) return json({ accepted: 0, duplicates: 0, rejected: [] });
  const t0 = Date.now();
  const { data, error } = await createAdminClient().rpc("apply_edge_events", { p_device: device.id, p_events: parsed.data as never });
  if (error) {
    console.error(JSON.stringify({ at: "edge.events", device: device.name, message: error.message }));
    return json({ error: "could not apply events" }, 500);
  }
  const r = data as RpcBatchResult;
  console.log(JSON.stringify({ at: "edge.events", device: device.name, n: parsed.data.length, accepted: r.accepted, duplicates: r.duplicates, rejected: r.rejected.length, ms: Date.now() - t0 }));
  return json(r);
}
