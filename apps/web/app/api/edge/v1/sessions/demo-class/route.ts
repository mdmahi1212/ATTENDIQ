import type { NextRequest } from "next/server";
import { startDemoClass } from "@/lib/demo-class";
import { json, requireDevice } from "@/lib/edge/route-helpers";
import { demoClassSchema } from "@/lib/edge/schemas";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * One-click recorded demo (demo\START-DEMO.bat on the classroom laptop): the edge starts a short real demo class
 * (5-15 min = the recording length, demo clock) for a section taught in the edge's own room. Refused while a class is live there.
 */
export async function POST(request: NextRequest) {
  const device = await requireDevice(request, ["edge"]);
  if (device instanceof Response) return device;
  const parsed = demoClassSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return json({ error: "bad request", issues: parsed.error.issues.map((i) => i.message) }, 400);
  const { section, minutes } = parsed.data;
  const admin = createAdminClient();
  const [code, no] = [section.slice(0, section.lastIndexOf("-")), section.slice(section.lastIndexOf("-") + 1)];
  const { data: rows, error } = await admin
    .from("sections")
    .select("id, room_id, courses!inner(code)")
    .eq("courses.code", code)
    .eq("section_no", no)
    .eq("room_id", device.room_id!);
  if (error) return json({ error: "lookup failed" }, 500);
  if (!rows?.length) return json({ error: `section ${section} is not taught in this device's room` }, 404);
  try {
    const { sessionId } = await startDemoClass(admin, { sectionId: rows[0].id, roomId: device.room_id!, length: minutes });
    console.log(JSON.stringify({ at: "edge.demo-class", device: device.name, session: sessionId, minutes }));
    return json({ session_id: sessionId, minutes }, 201);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json({ error: message }, message.includes("another live session") ? 409 : 400);
  }
}
