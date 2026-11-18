import type { NextRequest } from "next/server";
import { json, requireDevice } from "@/lib/edge/route-helpers";
import { roomCodeSchema } from "@/lib/edge/schemas";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/** GET ?room=B204 -> the live session of the device's room (+ policy), or 204 when none. */
export async function GET(request: NextRequest) {
  const device = await requireDevice(request, ["edge", "ingest", "simulator"]);
  if (device instanceof Response) return device;
  const admin = createAdminClient();
  const room = request.nextUrl.searchParams.get("room");
  if (room !== null) {
    if (!roomCodeSchema.safeParse(room).success) return json({ error: "bad room" }, 400);
    const { data } = await admin.from("rooms").select("id").eq("code", room).maybeSingle();
    if (!data || data.id !== device.room_id) return json({ error: "device is not in this room" }, 403);
  }
  const { data, error } = await admin.rpc("current_session_for_room", { p_room: device.room_id! });
  if (error) return json({ error: "lookup failed" }, 500);
  if (!data) return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  return json(data);
}
