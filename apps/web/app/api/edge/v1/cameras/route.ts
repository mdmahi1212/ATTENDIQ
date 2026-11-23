import type { NextRequest } from "next/server";
import { json, requireDevice } from "@/lib/edge/route-helpers";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/** GET -> this edge's camera geometry drawn on the website (normalised 0..1 to its rotated snapshot). */
export async function GET(request: NextRequest) {
  const device = await requireDevice(request, ["edge"]);
  if (device instanceof Response) return device;
  const { data, error } = await createAdminClient()
    .from("cameras")
    .select("kind, stream_url, rotate, roi, entry_line, exit_line, door_point")
    .eq("device_id", device.id);
  if (error) return json({ error: "lookup failed" }, 500);
  return json({ cameras: data ?? [] });
}
