import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Rotating room QR (CLAUDE.md): HMAC_SHA256(qr_secret, session_id + ":" + floor(epoch_seconds / slot)).
 * The QR encodes "aiq1.<session_id>.<slot>.<mac>" (mac = base64url HMAC). The server accepts the current
 * and the previous slot, so a code scanned just before it rotates still works. Server time only.
 */
export const QR_PREFIX = "aiq1";

export function slotAt(epochMs: number, slotSeconds: number): number {
  return Math.floor(epochMs / 1000 / slotSeconds);
}

export function qrMac(secret: string, sessionId: string, slot: number): string {
  return createHmac("sha256", secret).update(`${sessionId}:${slot}`).digest("base64url");
}

export function makeQrToken(secret: string, sessionId: string, epochMs: number, slotSeconds: number) {
  const slot = slotAt(epochMs, slotSeconds);
  return {
    token: `${QR_PREFIX}.${sessionId}.${slot}.${qrMac(secret, sessionId, slot)}`,
    slot,
    expiresAt: new Date((slot + 1) * slotSeconds * 1000),
  };
}

export type QrCheck = { ok: true; slot: number } | { ok: false; reason: "malformed" | "wrong_session" | "expired" | "bad_signature" };

export function parseQrToken(token: string): { sessionId: string; slot: number; mac: string } | null {
  const parts = token.trim().split(".");
  if (parts.length !== 4 || parts[0] !== QR_PREFIX) return null;
  const [, sessionId, slotStr, mac] = parts;
  if (!/^[0-9a-f-]{36}$/i.test(sessionId) || !/^\d{1,12}$/.test(slotStr) || !/^[A-Za-z0-9_-]{43}$/.test(mac)) return null;
  return { sessionId, slot: Number(slotStr), mac };
}

/** Constant-time check of a scanned token for this session at server time `nowMs`. */
export function verifyQrToken(token: string, secret: string, sessionId: string, nowMs: number, slotSeconds: number): QrCheck {
  const p = parseQrToken(token);
  if (!p) return { ok: false, reason: "malformed" };
  if (p.sessionId.toLowerCase() !== sessionId.toLowerCase()) return { ok: false, reason: "wrong_session" };
  const current = slotAt(nowMs, slotSeconds);
  if (p.slot !== current && p.slot !== current - 1) return { ok: false, reason: "expired" };
  const expected = Buffer.from(qrMac(secret, sessionId, p.slot));
  const given = Buffer.from(p.mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { ok: false, reason: "bad_signature" };
  return { ok: true, slot: p.slot };
}
