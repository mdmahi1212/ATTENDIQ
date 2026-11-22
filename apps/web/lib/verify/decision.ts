/**
 * Self-verify pass rule: face AND liveness AND room proof. Room proof = the room QR OR the seat the student tapped
 * (the room camera sees a person there; user decision 2026-11-23: no professor needed to show a QR). When the room
 * does not require it (rooms.require_qr false), GPS inside the room is enough too. "Liveness" = the browser challenges AND
 * the server-side passive anti-spoof check on the uploaded frame (a printed photo can fake a blink by covering
 * the eyes, so the browser result alone is not trusted). Pure: unit-tested.
 */
export type VerifyInput = {
  faceScore: number | null; // 1:1 cosine vs the student's own embeddings; null = no usable face
  faceThreshold: number; // policy verify_threshold (0.50)
  livenessOk: boolean; // browser challenges (blink / turn / smile)
  passiveLive: boolean | null; // server anti-spoof on the submitted frame (null = could not be evaluated)
  requirePassiveLive: boolean;
  qrOk: boolean | null; // null = not scanned
  seatOk?: boolean | null; // null / undefined = no seat tapped
  requireQr: boolean;
  gpsInside: boolean | null; // null = no fix
  gpsAccuracyM: number | null;
  gpsMaxAccuracyM: number; // policy gps_max_accuracy_m (40)
};

export type VerifyReason =
  | "face_not_found"
  | "face_mismatch"
  | "liveness_failed"
  | "spoof_suspected"
  | "liveness_unclear"
  | "qr_missing"
  | "qr_invalid"
  | "seat_not_found"
  | "gps_missing"
  | "gps_outside"
  | "gps_inaccurate";

export const REASON_TEXT: Record<VerifyReason, string> = {
  face_not_found: "No clear face in the photo",
  face_mismatch: "The face did not match your enrollment",
  liveness_failed: "The liveness check did not pass",
  spoof_suspected: "The photo looked like a picture or a screen, not a live face. Use your real face, in good light",
  liveness_unclear: "Hold the phone further away so your whole face and some background are visible",
  qr_missing: "Scan the room QR code shown in class",
  qr_invalid: "The room QR code was wrong or expired; scan the current one",
  seat_not_found: "The room camera does not see anyone where you tapped. Sit still and tap your seat again, or scan the room QR",
  gps_missing: "Location was not available",
  gps_outside: "Your location is not inside the classroom",
  gps_inaccurate: "Location accuracy was too low",
};

export function decideVerification(i: VerifyInput): { pass: boolean; reasons: VerifyReason[]; gpsOk: boolean } {
  const reasons: VerifyReason[] = [];
  if (i.faceScore === null) reasons.push("face_not_found");
  else if (i.faceScore < i.faceThreshold) reasons.push("face_mismatch");
  if (!i.livenessOk) reasons.push("liveness_failed");
  if (i.requirePassiveLive && i.passiveLive !== true) reasons.push(i.passiveLive === false ? "spoof_suspected" : "liveness_unclear");

  const seatOk = i.seatOk === true;
  const qrOk = i.qrOk === true || seatOk; // the seat proves the room as well as the QR does
  const gpsOk = i.gpsInside === true && i.gpsAccuracyM !== null && i.gpsAccuracyM <= i.gpsMaxAccuracyM;
  const qrProblem: VerifyReason | null = qrOk
    ? null
    : i.seatOk === false ? "seat_not_found" : i.qrOk === null ? "qr_missing" : "qr_invalid";
  const gpsProblem: VerifyReason | null =
    i.gpsInside === null || i.gpsAccuracyM === null ? "gps_missing" : !i.gpsInside ? "gps_outside" : i.gpsAccuracyM > i.gpsMaxAccuracyM ? "gps_inaccurate" : null;

  if (i.requireQr) {
    if (qrProblem) reasons.push(qrProblem);
  } else if (!qrOk && !gpsOk) {
    if (qrProblem) reasons.push(qrProblem);
    if (gpsProblem) reasons.push(gpsProblem);
  }
  return { pass: reasons.length === 0, reasons, gpsOk };
}

export const MAX_ATTEMPTS = 3;
