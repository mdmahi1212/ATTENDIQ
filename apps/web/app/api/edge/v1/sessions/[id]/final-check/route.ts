import type { NextRequest } from "next/server";
import { z } from "zod";
import { json, requireDevice } from "@/lib/edge/route-helpers";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const resultSchema = z.object({
  count: z.number().int().min(0).max(500),
  count_max: z.number().int().min(0).max(500),
  students: z.array(z.guid()).max(500),
  unknown_faces: z.number().int().min(0).max(999),
  window_s: z.number().min(0).max(600),
  frames: z.number().int().min(0).max(100000),
});

/** POST <- the edge's final room check (bodies over ~30 s + recognised faces + body names) for a live class. */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/edge/v1/sessions/[id]/final-check">) {
  const device = await requireDevice(request, ["edge"]);
  if (device instanceof Response) return device;
  const { id } = await ctx.params;
  if (!z.guid().safeParse(id).success) return json({ error: "bad session id" }, 400);
  const parsed = resultSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "bad result" }, 400);
  const admin = createAdminClient();
  const { data: s } = await admin.from("class_sessions").select("room_id, state").eq("id", id).maybeSingle();
  if (!s || s.room_id !== device.room_id) return json({ error: "not found" }, 404);
  const { data, error } = await admin.rpc("record_final_check", { p_session: id, p_result: parsed.data });
  if (error) return json({ error: error.message }, 400);
  return json(data, 201);
}
