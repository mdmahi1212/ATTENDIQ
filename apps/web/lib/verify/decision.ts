/**
 * Self-verify pass rule (BUILD_PROMPT): face AND liveness AND (QR OR (GPS inside AND accuracy <= max)).
 * QR is required when the room says so (rooms.require_qr, default true). Pure: unit-tested.
 */
export type VerifyInput = {
  faceScore: number | null; // 1:1 cosine vs the student's own embeddings; null = no usable face
  faceThreshold: number; // policy verify_threshold (0.50)
  livenessOk: boolean;
  qrOk: boolean | null; // null = not scanned
  requireQr: boolean;
  gpsInside: boolean | null; // null = no fix
  gpsAccuracyM: number | null;
  gpsMaxAccuracyM: number; // policy gps_max_accuracy_m (40)
};

export type VerifyReason =
  | "face_not_found"
  | "face_mismatch"
  | "liveness_failed"
  | "qr_missing"
  | "qr_invalid"
  | "gps_missing"
  | "gps_outside"
  | "gps_inaccurate";

export const REASON_TEXT: Record<VerifyReason, string> = {
  face_not_found: "No clear face in the photo",
  face_mismatch: "The face did not match your enrollment",
  liveness_failed: "The liveness check did not pass",
  qr_missing: "Scan the room QR code shown in class",
  qr_invalid: "The room QR code was wrong or expired; scan the current one",
  gps_missing: "Location was not available",
  gps_outside: "Your location is not inside the classroom",
  gps_inaccurate: "Location accuracy was too low",
};

export function decideVerification(i: VerifyInput): { pass: boolean; reasons: VerifyReason[]; gpsOk: boolean } {
  const reasons: VerifyReason[] = [];
  if (i.faceScore === null) reasons.push("face_not_found");
  else if (i.faceScore < i.faceThreshold) reasons.push("face_mismatch");
  if (!i.livenessOk) reasons.push("liveness_failed");

  const qrOk = i.qrOk === true;
  const gpsOk = i.gpsInside === true && i.gpsAccuracyM !== null && i.gpsAccuracyM <= i.gpsMaxAccuracyM;
  const qrProblem: VerifyReason | null = i.qrOk === null ? "qr_missing" : i.qrOk ? null : "qr_invalid";
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
