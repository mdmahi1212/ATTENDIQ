import "server-only";
import { DEVICE_KEY_PATTERN, hashDeviceKey } from "@/lib/device-key";
import { secretsMatch } from "@/lib/webhook-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type Device = { id: string; kind: string; room_id: string | null; name: string };

/**
 * Authenticates edge / ingest / simulator calls: `Authorization: Bearer <device key>`.
 * Looks the device up by the SHA-256 of the key (only hashes are stored) and records last_seen.
 */
export async function authenticateDevice(request: Request, kinds: string[]): Promise<Device | null> {
  const m = (request.headers.get("authorization") ?? "").match(/^Bearer\s+(\S+)$/i);
  if (!m || !DEVICE_KEY_PATTERN.test(m[1])) return null;
  const hash = hashDeviceKey(m[1]);
  const admin = createAdminClient();
  const { data } = await admin.from("edge_devices").select("id, kind, room_id, name, api_key_hash, is_active").eq("api_key_hash", hash).maybeSingle();
  if (!data || !data.is_active || !data.api_key_hash || !secretsMatch(data.api_key_hash, hash) || !kinds.includes(data.kind)) return null;
  await admin.from("edge_devices").update({ last_seen: new Date().toISOString() }).eq("id", data.id);
  return { id: data.id, kind: data.kind, room_id: data.room_id, name: data.name };
}
