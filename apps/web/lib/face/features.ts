/**
 * Per-frame features from MediaPipe Face Landmarker, in plain numbers so the liveness and capture
 * logic can be unit-tested with synthetic streams.
 *
 * Head direction comes from landmarks (camera coordinates, NOT the mirrored preview):
 *   yaw   = (nose.x - eyeMid.x) / eyeDistance   > 0  => the person turned to THEIR left
 *   pitch = (nose.y - eyeMid.y) / eyeDistance   larger => looking down (compare to a neutral baseline)
 * In an un-mirrored front-camera image the person's left side is on the image's right, so turning
 * to their left moves the nose toward larger x.
 */

export type Point = { x: number; y: number };

export type FrameFeatures = {
  t: number; // ms
  faces: number;
  blink: number; // 0..1, mean of eyeBlinkLeft/Right
  smile: number; // 0..1, mean of mouthSmileLeft/Right
  yaw: number;
  pitch: number;
  box: { x: number; y: number; w: number; h: number } | null; // normalised 0..1
  brightness: number | null; // 0..255 mean luma of the face box
};

// MediaPipe face mesh indices.
export const NOSE_TIP = 1;
export const EYE_OUTER_A = 33;
export const EYE_OUTER_B = 263;

export function headPose(landmarks: Point[]): { yaw: number; pitch: number } {
  const nose = landmarks[NOSE_TIP];
  const a = landmarks[EYE_OUTER_A];
  const b = landmarks[EYE_OUTER_B];
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1e-6;
  return { yaw: (nose.x - mid.x) / dist, pitch: (nose.y - mid.y) / dist };
}

export function boundingBox(landmarks: Point[]): { x: number; y: number; w: number; h: number } {
  let minX = 1, minY = 1, maxX = 0, maxY = 0;
  for (const p of landmarks) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function blendshape(categories: { categoryName: string; score: number }[], ...names: string[]): number {
  const scores = names.map((n) => categories.find((c) => c.categoryName === n)?.score ?? 0);
  return scores.reduce((s, v) => s + v, 0) / (scores.length || 1);
}

/** Mean luma (BT.601) of RGBA pixels. */
export function meanLuma(rgba: Uint8ClampedArray): number {
  let sum = 0;
  const n = rgba.length / 4;
  for (let i = 0; i < rgba.length; i += 4) sum += 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
  return n ? sum / n : 0;
}

export type Guidance = "ok" | "no_face" | "multiple_faces" | "move_closer" | "move_back" | "center_face" | "too_dark" | "too_bright";

export const GUIDANCE_TEXT: Record<Guidance, string> = {
  ok: "Hold still",
  no_face: "Show your face to the camera",
  multiple_faces: "Only one person in the frame, please",
  move_closer: "Move a little closer",
  move_back: "Move a little back",
  center_face: "Center your face in the oval",
  too_dark: "Too dark: face a light source",
  too_bright: "Too bright: avoid strong light behind or on you",
};

/** Framing checks before liveness and capture: one face, centred, right size, sensible light. */
export function guidance(f: Pick<FrameFeatures, "faces" | "box" | "brightness">): Guidance {
  if (f.faces === 0 || !f.box) return "no_face";
  if (f.faces > 1) return "multiple_faces";
  const cx = f.box.x + f.box.w / 2;
  const cy = f.box.y + f.box.h / 2;
  if (f.box.w < 0.28) return "move_closer";
  if (f.box.w > 0.75) return "move_back";
  if (Math.abs(cx - 0.5) > 0.15 || Math.abs(cy - 0.5) > 0.18) return "center_face";
  if (f.brightness !== null && f.brightness < 55) return "too_dark";
  if (f.brightness !== null && f.brightness > 215) return "too_bright";
  return "ok";
}
