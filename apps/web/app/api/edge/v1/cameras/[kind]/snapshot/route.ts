import type { NextRequest } from "next/server";
import { json, requireDevice } from "@/lib/edge/route-helpers";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const MAX_BYTES = 2_000_000;

/**
 * POST image/jpeg -> the latest picture of this edge's door ("gate") or room ("inside") camera, so the geometry can
 * be drawn on it (Operator -> camera). One file per camera, overwritten each time; private bucket, operators only.
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/edge/v1/cameras/[kind]/snapshot">) {
  const device = await requireDevice(request, ["edge"]);
  if (device instanceof Response) return device;
  const { kind } = await ctx.params;
  if (kind !== "gate" && kind !== "inside") return json({ error: "bad camera kind" }, 400);
  if (request.headers.get("content-type") !== "image/jpeg") return json({ error: "send image/jpeg" }, 415);
  const body = Buffer.from(await request.arrayBuffer());
  if (body.length < 100 || body.length > MAX_BYTES) return json({ error: "bad image size" }, 413);
  if (body[0] !== 0xff || body[1] !== 0xd8) return json({ error: "not a JPEG" }, 400);
  const admin = createAdminClient();
  const { data: cam } = await admin.from("cameras").select("id").eq("device_id", device.id).eq("kind", kind).maybeSingle();
  if (!cam) return json({ error: "camera not registered" }, 404);
  const path = `${cam.id}/edge-latest.jpg`;
  const up = await admin.storage.from("camera-snapshots").upload(path, body, { contentType: "image/jpeg", upsert: true });
  if (up.error) return json({ error: up.error.message }, 500);
  await admin.from("cameras").update({ snapshot_path: path, snapshot_at: new Date().toISOString() }).eq("id", cam.id);
  return json({ ok: true }, 201);
}
