import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { CONSENT_VERSION } from "@/lib/consent";
import { duplicateDecision, enrollMetaSchema, MAX_IMAGE_BYTES, MIN_GOOD_IMAGES, selectEmbeddings, type DuplicateHit } from "@/lib/face/enroll";
import { embedImages, FACE_MODEL_VERSION, FaceApiError } from "@/lib/face-api";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Statuses from which a student may (re-)enroll themselves. `active`/`review` need an admin first. */
const ENROLLABLE = new Set(["pending", "rejected", "deleted"]);
const MAX_THUMB_BYTES = 60_000;

const fail = (status: number, error: string, extra: Record<string, unknown> = {}) => NextResponse.json({ ok: false, error, ...extra }, { status });

/**
 * multipart/form-data: meta (JSON: poses[], liveness, consent_version), images[] (JPEG, one per pose),
 * thumb (small JPEG, kept only if the enrollment needs admin review).
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return fail(401, "Please sign in again.");
  if (user.role !== "student") return fail(403, "Only students enroll a face.");

  const form = await request.formData().catch(() => null);
  if (!form) return fail(400, "Bad upload.");
  let metaJson: unknown = null;
  try {
    metaJson = JSON.parse(String(form.get("meta") ?? ""));
  } catch {
    /* handled below */
  }
  const meta = enrollMetaSchema.safeParse(metaJson);
  if (!meta.success) return fail(400, "The liveness check or the photo set is incomplete. Please start again.");
  const images = form.getAll("images").filter((v): v is File => v instanceof File);
  if (images.length !== meta.data.poses.length) return fail(400, "Photo count does not match.");
  if (images.some((f) => f.size === 0 || f.size > MAX_IMAGE_BYTES || f.type !== "image/jpeg")) return fail(400, "A photo is too large or not a JPEG.");

  const supabase = await createClient();
  if (meta.data.consent_version !== CONSENT_VERSION) return fail(409, "The consent text changed. Please read and accept it again.");
  const { data: consent } = await supabase
    .from("biometric_consents")
    .select("version")
    .eq("student_id", user.id)
    .eq("version", CONSENT_VERSION)
    .is("withdrawn_at", null)
    .maybeSingle();
  if (!consent) return fail(403, "Consent is required before enrollment.");

  const { data: profile } = await supabase.from("face_profiles").select("status").eq("student_id", user.id).maybeSingle();
  const current = profile?.status ?? "pending";
  if (!ENROLLABLE.has(current)) {
    return fail(409, current === "review" ? "Your enrollment is waiting for admin review." : "You are already enrolled. Ask an admin to reset it if you need to re-enroll.");
  }

  let results;
  try {
    results = await embedImages(images);
  } catch (e) {
    const code = e instanceof FaceApiError ? e.code : "unreachable";
    console.error(JSON.stringify({ at: "face.enroll", step: "embed", code, message: (e as Error).message }));
    return fail(503, "The face service is offline right now. Please try again later.", { code });
  }

  const { kept, dropped } = selectEmbeddings(results, meta.data.poses);
  if (kept.length < MIN_GOOD_IMAGES) {
    return fail(422, `Only ${kept.length} of ${images.length} photos were usable (need ${MIN_GOOD_IMAGES}). Try better light and hold the phone at eye level.`, { dropped });
  }

  // Duplicate check: does any OTHER student's face match one of these embeddings?
  const admin = createAdminClient();
  const hits: DuplicateHit[] = [];
  const matches = await Promise.all(
    kept.map((k) => admin.rpc("match_face_any", { p_embedding: JSON.stringify(k.embedding), p_exclude: user.id })),
  );
  for (const m of matches) {
    if (m.error) {
      console.error(JSON.stringify({ at: "face.enroll", step: "duplicate", message: m.error.message }));
      return fail(500, "Could not complete the duplicate check. Please try again.");
    }
    hits.push(...(m.data ?? []));
  }
  const decision = duplicateDecision(hits);

  let note: string | null = null;
  if (decision.status === "review" && decision.best) {
    note = `possible duplicate of student ${decision.best.student_id} (similarity ${decision.best.similarity.toFixed(2)})`;
    const thumb = form.get("thumb");
    if (thumb instanceof File && thumb.type === "image/jpeg" && thumb.size > 0 && thumb.size <= MAX_THUMB_BYTES) {
      const up = await admin.storage.from("face-review").upload(`${user.id}.jpg`, thumb, { contentType: "image/jpeg", upsert: true });
      if (up.error) console.error(JSON.stringify({ at: "face.enroll", step: "thumb", message: up.error.message }));
    }
  }

  const { data: stored, error } = await admin.rpc("store_face_enrollment", {
    p_student: user.id,
    p_embeddings: kept.map((k) => ({ embedding: k.embedding, quality: k.det_score, pose: k.pose })),
    p_status: decision.status,
    p_note: note ?? `self-enrolled: ${kept.length} photos, liveness ${meta.data.liveness.challenges.join("/")}`,
    p_replace: true,
    p_model: FACE_MODEL_VERSION,
  });
  if (error) {
    console.error(JSON.stringify({ at: "face.enroll", step: "store", message: error.message }));
    return fail(500, "Could not save your enrollment. Please try again.");
  }

  console.log(JSON.stringify({ at: "face.enroll", student: user.id, kept: kept.length, dropped: dropped.length, status: decision.status }));
  return NextResponse.json({ ok: true, status: decision.status, stored, kept: kept.length, dropped });
}
