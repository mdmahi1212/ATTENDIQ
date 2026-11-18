import { createHash, randomBytes } from "node:crypto";

/**
 * Same format as scripts/new-device-key.ps1: "sadev_" + 43 base64url chars (32 random bytes).
 * Only sha256(utf8(key)) as lowercase hex is stored (edge_devices.api_key_hash).
 */
export function generateDeviceKey(): { key: string; hash: string } {
  const key = "sadev_" + randomBytes(32).toString("base64url");
  return { key, hash: hashDeviceKey(key) };
}

export function hashDeviceKey(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

export const DEVICE_KEY_PATTERN = /^sadev_[A-Za-z0-9_-]{43}$/;
