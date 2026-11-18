import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { ALL_CHALLENGES } from "@/lib/face/liveness";
import { embedImages, FaceApiError } from "@/lib/face-api";
import { createAdminClient } from "@/lib/supabase/admin";
import { decideVerification, MAX_ATTEMPTS, type VerifyReason } from "@/lib/verify/decision";
import { verifyQrToken } from "@/lib/verify/qr";
import { loadRequestContext, policyNum, windowOpen } from "@/lib/verify/server";

export const runtime = "nodejs";
export const maxDuration = 30;

const metaSchema = z.object({
  liveness: z.object({
    passed: z.boolean(),
    challenges: z.array(z.enum(ALL_CHALLENGES as unknown as [string, ...string[]])).max(3),
    duration_ms: z.number().int().min(0).max(300_000),
  }),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  accuracy: z.number().min(0).max(100_000).nullable().optional(),
  qr_token: z.string().max(200).nullable().optional(),
});

const fail = (status: number, error: string, extra: Record<string, unknown> = {}) => NextResponse.json({ ok: false, error, ...extra }, { status });

/**
 * Student self-verification: one front-camera frame + liveness result + GPS + scanned room QR.
 * Server checks the window, eligibility, attempts, QR (HMAC, constant time), geofence (PostGIS) and
 * face 1:1 against the student's own embeddings; stores the attempt; a pass is applied by the DB rule engine.
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/verify/[requestId]">) {
  const user = await getCurrentUser();
  if (!user) return fail(401, "Please sign in again.");
  if (user.role !== "student") return fail(403, "Only students verify.");
  const { requestId } = await ctx.params;
  if (!z.guid().safeParse(requestId).success) return fail(400, "Bad link.");

  const admin = createAdminClient();
  const rc = await loadRequestContext(admin, requestId, user.id);
  if (!rc) return fail(404, "This verification request does not exist.");
  const now = Date.now();
  if (!windowOpen(rc.request, now)) return fail(409, "This verification window is closed.", { code: "window_closed" });
  if (!rc.eligible) return fail(403, "You are not asked to verify in this class.", { code: "not_a_target" });
  if (rc.passed) return NextResponse.json({ ok: true, pass: true, already: true, reasons: [], attempts_left: MAX_ATTEMPTS - rc.attempts });
  if (rc.attempts >= MAX_ATTEMPTS) return fail(429, "No attempts left. Request a manual check.", { code: "no_attempts" });

  const form = await request.formData().catch(() => null);
  const frame = form?.get("frame");
  let metaJson: unknown = null;
  try {
    metaJson = JSON.parse(String(form?.get("meta") ?? ""));
  } catch {
    /* handled below */
  }
  const meta = metaSchema.safeParse(metaJson);
  if (!meta.success || !(frame instanceof File) || frame.type !== "image/jpeg" || frame.size === 0 || frame.size > 600_000) {
    return fail(400, "Incomplete verification. Please try again.");
  }

  const { data: face } = await admin.from("face_profiles").select("status").eq("student_id", user.id).maybeSingle();
  if (face?.status !== "active") return fail(409, "Your face is not enrolled (or awaiting review). Request a manual check.", { code: "not_enrolled" });

  // Face 1:1
  let faceScore: number | null = null;
  try {
    const [r] = await embedImages([frame]);
    if (r?.ok && r.embedding) {
      const { data: sim, error } = await admin.rpc("match_face", { p_student: user.id, p_embedding: JSON.stringify(r.embedding) });
      if (error) throw new Error(error.message);
      faceScore = sim ?? null;
    }
  } catch (e) {
    const code = e instanceof FaceApiError ? e.code : "error";
    console.error(JSON.stringify({ at: "verify", step: "face", code, message: (e as Error).message }));
    return fail(503, "The face service is offline right now. Try again in a minute or request a manual check.", { code: "face_service" });
  }

  // Room QR
  let qrOk: boolean | null = null;
  let qrReason: string | null = null;
  if (meta.data.qr_token) {
    const { data: secret } = await admin.from("session_secrets").select("qr_secret").eq("session_id", rc.session.id).maybeSingle();
    const check = secret
      ? verifyQrToken(meta.data.qr_token, secret.qr_secret, rc.session.id, now, policyNum(rc.session.policy, "qr_slot_seconds", 20))
      : ({ ok: false, reason: "malformed" } as const);
    qrOk = check.ok;
    qrReason = check.ok ? null : check.reason;
  }

  // GPS (supporting signal)
  const { lat, lng, accuracy } = meta.data;
  let gpsInside: boolean | null = null;
  if (lat != null && lng != null && rc.session.room_id) {
    const { data } = await admin.rpc("check_geofence", { p_room: rc.session.room_id, p_lat: lat, p_lng: lng, p_accuracy_m: accuracy ?? 0 });
    gpsInside = data === true;
  }

  const decision = decideVerification({
    faceScore,
    faceThreshold: policyNum(rc.session.policy, "verify_threshold", 0.5),
    livenessOk: meta.data.liveness.passed && meta.data.liveness.challenges.length >= 2,
    qrOk,
    requireQr: rc.requireQr,
    gpsInside,
    gpsAccuracyM: accuracy ?? null,
    gpsMaxAccuracyM: policyNum(rc.session.policy, "gps_max_accuracy_m", 40),
  });

  const { data: attempt, error: insErr } = await admin
    .from("verification_attempts")
    .insert({
      request_id: requestId,
      student_id: user.id,
      device_id: request.headers.get("user-agent")?.slice(0, 120) ?? null,
      face_score: faceScore,
      liveness_ok: meta.data.liveness.passed,
      lat: lat ?? null,
      lng: lng ?? null,
      gps_accuracy_m: accuracy ?? null,
      gps_ok: decision.gpsOk,
      qr_ok: qrOk,
      result: decision.pass ? "pass" : "fail",
      reason: [...decision.reasons, ...(qrReason ? [`qr:${qrReason}`] : [])].join(",") || null,
    })
    .select("id")
    .single();
  if (insErr || !attempt) return fail(500, "Could not save the attempt. Please try again.");

  let status: string | null = null;
  if (decision.pass) {
    const { data: applied, error } = await admin.rpc("apply_self_verification", { p_attempt: attempt.id });
    if (error) return fail(500, "Could not apply the verification. Please try again.");
    const a = applied as { applied?: boolean; status?: string; reason?: string } | null;
    if (!a?.applied) return fail(409, a?.reason === "window_closed" ? "The window closed just now." : "Could not apply the verification.", { code: a?.reason });
    status = a.status ?? null;
  }
  console.log(JSON.stringify({ at: "verify", student: user.id, request: requestId, pass: decision.pass, reasons: decision.reasons, face: faceScore, qr: qrOk, gps: gpsInside }));
  return NextResponse.json({
    ok: true,
    pass: decision.pass,
    status,
    reasons: decision.reasons as VerifyReason[],
    face_score: faceScore === null ? null : Math.round(faceScore * 100) / 100,
    attempts_left: MAX_ATTEMPTS - rc.attempts - 1,
  });
}
