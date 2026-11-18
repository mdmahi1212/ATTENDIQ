import "server-only";
import { NextResponse } from "next/server";
import { authenticateDevice, type Device } from "@/lib/device-auth";
import { rateLimited } from "@/lib/rate-limit";

export const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** Device-key auth for /api/edge/v1/*; requires the device to belong to a room; per-device rate limit. */
export async function requireDevice(request: Request, kinds: string[]): Promise<Device | NextResponse> {
  const device = await authenticateDevice(request, kinds);
  if (!device) return json({ error: "unauthorized" }, 401);
  if (!device.room_id) return json({ error: "device has no room" }, 403);
  const limited = await rateLimited("device", device.id);
  if (limited) return limited;
  return device;
}
