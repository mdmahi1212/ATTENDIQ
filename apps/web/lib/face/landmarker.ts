"use client";

import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import { blendshape, boundingBox, headPose, meanLuma, type FrameFeatures } from "@/lib/face/features";

/** Browser-only: loads MediaPipe Face Landmarker from the self-hosted /mediapipe/ files. */
export async function loadLandmarker(): Promise<FaceLandmarker> {
  const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
  const fileset = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
  const opts = (delegate: "GPU" | "CPU") => ({
    baseOptions: { modelAssetPath: "/mediapipe/face_landmarker.task", delegate },
    runningMode: "VIDEO" as const,
    numFaces: 2, // so we can SEE a second face and refuse it
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: false,
  });
  try {
    return await FaceLandmarker.createFromOptions(fileset, opts("GPU"));
  } catch {
    return await FaceLandmarker.createFromOptions(fileset, opts("CPU"));
  }
}

const probe = typeof document !== "undefined" ? document.createElement("canvas") : null;

/** Mean brightness of the face box, sampled at 32x32 to stay cheap. */
function faceBrightness(video: HTMLVideoElement, box: FrameFeatures["box"]): number | null {
  if (!probe || !box || !video.videoWidth) return null;
  const ctx = probe.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  probe.width = 32;
  probe.height = 32;
  const sx = Math.max(0, box.x) * video.videoWidth;
  const sy = Math.max(0, box.y) * video.videoHeight;
  ctx.drawImage(video, sx, sy, box.w * video.videoWidth, box.h * video.videoHeight, 0, 0, 32, 32);
  return meanLuma(ctx.getImageData(0, 0, 32, 32).data);
}

export function extractFeatures(landmarker: FaceLandmarker, video: HTMLVideoElement, t: number): FrameFeatures {
  const r = landmarker.detectForVideo(video, t);
  const faces = r.faceLandmarks.length;
  if (faces === 0) return { t, faces, blink: 0, smile: 0, yaw: 0, pitch: 0, box: null, brightness: null };
  const lm = r.faceLandmarks[0];
  const cats = r.faceBlendshapes[0]?.categories ?? [];
  const box = boundingBox(lm);
  return {
    t,
    faces,
    blink: blendshape(cats, "eyeBlinkLeft", "eyeBlinkRight"),
    smile: blendshape(cats, "mouthSmileLeft", "mouthSmileRight"),
    ...headPose(lm),
    box,
    brightness: faceBrightness(video, box),
  };
}

/** JPEG of the current frame, scaled so the long side is at most `maxSide` px (un-mirrored). */
export function grabJpeg(video: HTMLVideoElement, maxSide: number, quality: number): Promise<Blob> {
  const scale = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight));
  const c = document.createElement("canvas");
  c.width = Math.round(video.videoWidth * scale);
  c.height = Math.round(video.videoHeight * scale);
  c.getContext("2d")!.drawImage(video, 0, 0, c.width, c.height);
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("capture failed"))), "image/jpeg", quality));
}
