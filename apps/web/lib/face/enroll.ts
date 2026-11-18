import { z } from "zod";
import { ALL_CHALLENGES } from "@/lib/face/liveness";
import { POSES } from "@/lib/face/capture";

/** Pure server-side rules of /api/face/enroll (unit-tested; the route only wires I/O). */

export const MIN_GOOD_IMAGES = 5;
export const MAX_IMAGES = 10;
export const DUPLICATE_SIMILARITY = 0.6; // any other student above this -> admin review
export const CONSISTENCY_MIN = 0.45; // an image far from this person's own mean is dropped
export const MAX_IMAGE_BYTES = 600_000; // client sends ~720 px JPEGs (Vercel body limit is 4.5 MB)

export const enrollMetaSchema = z.object({
  poses: z.array(z.enum(POSES as unknown as [string, ...string[]])).min(MIN_GOOD_IMAGES).max(MAX_IMAGES),
  liveness: z.object({
    passed: z.literal(true),
    challenges: z.array(z.enum(ALL_CHALLENGES as unknown as [string, ...string[]])).length(3),
    duration_ms: z.number().int().min(1000).max(300_000),
  }),
  consent_version: z.string().min(1),
});
export type EnrollMeta = z.infer<typeof enrollMetaSchema>;

export const faceApiResultSchema = z.array(
  z.object({
    ok: z.boolean(),
    embedding: z.array(z.number()).length(512).optional(),
    det_score: z.number().nullable().optional(),
    face_px: z.number().nullable().optional(),
    blur: z.number().nullable().optional(),
    reason: z.string().optional(),
  }),
);
export type FaceApiResult = z.infer<typeof faceApiResultSchema>[number];

export const dot = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * b[i], 0);

export function normalise(v: number[]): number[] {
  const n = Math.sqrt(dot(v, v)) || 1;
  return v.map((x) => x / n);
}

export function meanVector(vs: number[][]): number[] {
  const out = new Array(vs[0].length).fill(0);
  for (const v of vs) for (let i = 0; i < v.length; i++) out[i] += v[i];
  return normalise(out.map((x) => x / vs.length));
}

export type Kept = { index: number; pose: string; embedding: number[]; det_score: number };
export type Dropped = { index: number; pose: string; reason: string };

/**
 * Keeps the face-api's good images, then drops any that do not match the rest
 * (e.g. someone else stepped into one frame). Returns what to store and what was rejected.
 */
export function selectEmbeddings(results: FaceApiResult[], poses: string[]): { kept: Kept[]; dropped: Dropped[] } {
  const dropped: Dropped[] = [];
  let kept: Kept[] = [];
  results.forEach((r, index) => {
    const pose = poses[index] ?? "unknown";
    if (r.ok && r.embedding) kept.push({ index, pose, embedding: r.embedding, det_score: r.det_score ?? 0 });
    else dropped.push({ index, pose, reason: r.reason ?? "rejected" });
  });
  if (kept.length >= 2) {
    const mean = meanVector(kept.map((k) => k.embedding));
    const consistent = kept.filter((k) => dot(k.embedding, mean) >= CONSISTENCY_MIN);
    for (const k of kept) if (!consistent.includes(k)) dropped.push({ index: k.index, pose: k.pose, reason: "inconsistent" });
    kept = consistent;
  }
  dropped.sort((a, b) => a.index - b.index);
  return { kept, dropped };
}

export type DuplicateHit = { student_id: string; similarity: number };

/** Highest similarity to any OTHER student across all kept embeddings. */
export function duplicateDecision(hits: DuplicateHit[]): { status: "active" | "review"; best: DuplicateHit | null } {
  const best = hits.reduce<DuplicateHit | null>((b, h) => (!b || h.similarity > b.similarity ? h : b), null);
  return { status: best && best.similarity > DUPLICATE_SIMILARITY ? "review" : "active", best };
}

export const REJECTION_TEXT: Record<string, string> = {
  no_face: "no face found",
  multiple_faces: "more than one face",
  face_too_small: "face too small",
  low_detection_score: "face not clear",
  too_blurry: "too blurry",
  not_an_image: "not an image",
  image_too_large: "image too large",
  inconsistent: "did not match your other photos",
  bad_embedding: "could not read the face",
  rejected: "rejected",
};
