import { describe, expect, it } from "vitest";
import { decideVerification, type VerifyInput } from "@/lib/verify/decision";
import { makeQrToken, parseQrToken, qrMac, slotAt, verifyQrToken } from "@/lib/verify/qr";

const SECRET = "a".repeat(64);
const SESSION = "2a62dd17-724a-4632-af49-cba56aced624";
const SLOT = 20;

describe("rotating room QR", () => {
  const t0 = Date.UTC(2026, 10, 18, 2, 0, 0); // slot boundary (divisible by 20 s)

  it("token round-trips and matches the CLAUDE.md HMAC definition", () => {
    const { token, slot, expiresAt } = makeQrToken(SECRET, SESSION, t0 + 5_000, SLOT);
    expect(slot).toBe(slotAt(t0, SLOT));
    expect(expiresAt.getTime()).toBe(t0 + 20_000);
    expect(parseQrToken(token)).toEqual({ sessionId: SESSION, slot, mac: qrMac(SECRET, SESSION, slot) });
    expect(verifyQrToken(token, SECRET, SESSION, t0 + 19_999, SLOT)).toEqual({ ok: true, slot });
  });

  it("accepts the previous slot, rejects two slots back and future slots", () => {
    const { token } = makeQrToken(SECRET, SESSION, t0, SLOT);
    expect(verifyQrToken(token, SECRET, SESSION, t0 + 20_000, SLOT).ok).toBe(true); // next slot: previous accepted
    expect(verifyQrToken(token, SECRET, SESSION, t0 + 39_999, SLOT).ok).toBe(true);
    expect(verifyQrToken(token, SECRET, SESSION, t0 + 40_000, SLOT)).toEqual({ ok: false, reason: "expired" });
    expect(verifyQrToken(token, SECRET, SESSION, t0 - 1, SLOT)).toEqual({ ok: false, reason: "expired" }); // from the future
  });

  it("rejects other sessions, wrong secrets and tampering", () => {
    const { token, slot } = makeQrToken(SECRET, SESSION, t0, SLOT);
    expect(verifyQrToken(token, SECRET, "11111111-1111-4111-8111-111111111111", t0, SLOT)).toEqual({ ok: false, reason: "wrong_session" });
    expect(verifyQrToken(token, "b".repeat(64), SESSION, t0, SLOT)).toEqual({ ok: false, reason: "bad_signature" });
    const forged = `aiq1.${SESSION}.${slot + 1}.${qrMac(SECRET, SESSION, slot)}`;
    expect(verifyQrToken(forged, SECRET, SESSION, t0 + 20_000, SLOT)).toEqual({ ok: false, reason: "bad_signature" });
    for (const bad of ["", "hello", `aiq1.${SESSION}.x.y`, `aiq2.${SESSION}.${slot}.${"A".repeat(43)}`])
      expect(verifyQrToken(bad, SECRET, SESSION, t0, SLOT)).toEqual({ ok: false, reason: "malformed" });
  });
});

describe("self-verify decision", () => {
  const base: VerifyInput = {
    faceScore: 0.7,
    faceThreshold: 0.5,
    livenessOk: true,
    qrOk: true,
    requireQr: true,
    gpsInside: true,
    gpsAccuracyM: 12,
    gpsMaxAccuracyM: 40,
  };

  it("passes with face + liveness + QR", () => {
    expect(decideVerification(base)).toEqual({ pass: true, reasons: [], gpsOk: true });
  });

  it("face and liveness are always required", () => {
    expect(decideVerification({ ...base, faceScore: 0.42 }).reasons).toEqual(["face_mismatch"]);
    expect(decideVerification({ ...base, faceScore: null }).reasons).toEqual(["face_not_found"]);
    expect(decideVerification({ ...base, livenessOk: false }).reasons).toEqual(["liveness_failed"]);
  });

  it("QR required by the room: GPS alone is not enough", () => {
    expect(decideVerification({ ...base, qrOk: null }).reasons).toEqual(["qr_missing"]);
    expect(decideVerification({ ...base, qrOk: false }).reasons).toEqual(["qr_invalid"]);
  });

  it("QR optional: GPS inside with good accuracy is enough; otherwise both problems are reported", () => {
    const opt = { ...base, requireQr: false, qrOk: null };
    expect(decideVerification(opt).pass).toBe(true);
    expect(decideVerification({ ...opt, gpsAccuracyM: 80 }).reasons).toEqual(["qr_missing", "gps_inaccurate"]);
    expect(decideVerification({ ...opt, gpsInside: false }).reasons).toEqual(["qr_missing", "gps_outside"]);
    expect(decideVerification({ ...opt, gpsInside: null, gpsAccuracyM: null }).reasons).toEqual(["qr_missing", "gps_missing"]);
    expect(decideVerification({ ...opt, gpsInside: false, qrOk: true }).pass).toBe(true);
  });

  it("threshold boundary is inclusive", () => {
    expect(decideVerification({ ...base, faceScore: 0.5 }).pass).toBe(true);
  });
});
