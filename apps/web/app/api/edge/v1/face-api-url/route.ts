import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authenticateDevice } from "@/lib/device-auth";
import { rateLimited } from "@/lib/rate-limit";
import { faceApiUrlSchema } from "@/lib/face/url";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * scripts/start-face-api.ps1 publishes the face-api tunnel URL here (it changes on every quick-tunnel start).
 * Auth: the laptop's edge device key. The laptop never holds Supabase credentials.
 */
export async function POST(request: NextRequest) {
  const device = await authenticateDevice(request, ["edge"]);
  if (!device) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const limited = await rateLimited("device", device.id);
  if (limited) return limited;
  const parsed = z.object({ url: faceApiUrlSchema }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "url must be https://<hostname>" }, { status: 400 });
  const { error } = await createAdminClient().rpc("set_app_config", { p_key: "face_api_url", p_value: parsed.data.url });
  if (error) return NextResponse.json({ error: "could not save" }, { status: 500 });
  console.log(JSON.stringify({ at: "edge.face-api-url", device: device.name, url: parsed.data.url }));
  return NextResponse.json({ ok: true });
}
