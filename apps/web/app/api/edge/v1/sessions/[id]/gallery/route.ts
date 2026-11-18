import type { NextRequest } from "next/server";
import { z } from "zod";
import { json, requireDevice } from "@/lib/edge/route-helpers";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Face gallery for a live session: only students enrolled in that section with an ACTIVE face profile.
 * Biometric data: edge devices of the session's own room only, and only while the session is running.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/edge/v1/sessions/[id]/gallery">) {
  const device = await requireDevice(request, ["edge"]);
  if (device instanceof Response) return device;
  const { id } = await ctx.params;
  if (!z.guid().safeParse(id).success) return json({ error: "bad session id" }, 400);
  const admin = createAdminClient();
  const { data: session } = await admin.from("class_sessions").select("room_id, state").eq("id", id).maybeSingle();
  if (!session || session.room_id !== device.room_id) return json({ error: "not found" }, 404);
  if (session.state !== "live" && session.state !== "recheck") return json({ error: "session is not live" }, 409);
  const { data, error } = await admin.rpc("session_gallery", { p_session: id });
  if (error) return json({ error: "gallery failed" }, 500);
  console.log(JSON.stringify({ at: "edge.gallery", device: device.name, session: id, students: (data as { students?: unknown[] })?.students?.length ?? 0 }));
  return json(data);
}
