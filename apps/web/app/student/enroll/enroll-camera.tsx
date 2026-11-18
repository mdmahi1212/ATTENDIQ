"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import { Button } from "@/components/ui/button";
import { CapturePlan, neutralPitch, POSE_TEXT, POSES, type Pose } from "@/lib/face/capture";
import { REJECTION_TEXT, type Dropped } from "@/lib/face/enroll";
import { guidance, GUIDANCE_TEXT, type Guidance } from "@/lib/face/features";
import { extractFeatures, grabJpeg, loadLandmarker } from "@/lib/face/landmarker";
import { CHALLENGE_TEXT, LivenessSession, pickChallenges, type Challenge } from "@/lib/face/liveness";

type Phase = "idle" | "loading" | "liveness" | "capture" | "uploading" | "done" | "error";
type Ui = {
  phase: Phase;
  hint: Guidance | null;
  challenge: Challenge | null;
  challengeNo: number;
  pose: Pose | null;
  shots: number;
  message: string | null;
  dropped: Dropped[];
};

const INITIAL: Ui = { phase: "idle", hint: null, challenge: null, challengeNo: 0, pose: null, shots: 0, message: null, dropped: [] };
const TOTAL_SHOTS = POSES.length * 2;
const CAPTURE_TIMEOUT_MS = 45_000;
const FACE_LOST_MS = 1500;

const FAILURE_TEXT = {
  timeout: "Time ran out for that step.",
  face_lost: "Your face left the frame.",
  multiple_faces: "Another face appeared in the frame.",
} as const;

export function EnrollCamera({ consentVersion }: { consentVersion: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const rafRef = useRef<number>(0);
  const [ui, setUi] = useState<Ui>(INITIAL);

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => () => {
    stop();
    landmarkerRef.current?.close();
  }, [stop]);

  const fail = useCallback(
    (message: string, dropped: Dropped[] = []) => {
      stop();
      setUi({ ...INITIAL, phase: "error", message, dropped });
    },
    [stop],
  );

  const upload = useCallback(
    async (images: Blob[], poses: Pose[], thumb: Blob | null, liveness: { challenges: Challenge[]; durationMs: number }) => {
      setUi((u) => ({ ...u, phase: "uploading", hint: null }));
      const form = new FormData();
      form.append(
        "meta",
        JSON.stringify({
          poses,
          liveness: { passed: true, challenges: liveness.challenges, duration_ms: Math.round(liveness.durationMs) },
          consent_version: consentVersion,
        }),
      );
      images.forEach((b, i) => form.append("images", b, `img${i}.jpg`));
      if (thumb) form.append("thumb", thumb, "thumb.jpg");
      try {
        const res = await fetch("/api/face/enroll", { method: "POST", body: form });
        const body = (await res.json().catch(() => ({}))) as { ok?: boolean; status?: string; error?: string; dropped?: Dropped[] };
        if (!res.ok || !body.ok) return fail(body.error ?? `Upload failed (HTTP ${res.status}).`, body.dropped ?? []);
        setUi({
          ...INITIAL,
          phase: "done",
          message:
            body.status === "review"
              ? "Saved. Your face looks very similar to another account, so an admin will review it before it is used."
              : "Done! Your face is enrolled and the door camera can now mark you present.",
          dropped: body.dropped ?? [],
        });
      } catch {
        fail("Network error while uploading. Check your connection and try again.");
      }
    },
    [consentVersion, fail],
  );

  const start = useCallback(async () => {
    setUi({ ...INITIAL, phase: "loading" });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      landmarkerRef.current ??= await loadLandmarker();
    } catch (e) {
      const name = (e as DOMException)?.name;
      return fail(
        name === "NotAllowedError"
          ? "Camera permission was denied. Allow the camera for this site in your browser settings and try again."
          : name === "NotFoundError"
            ? "No camera was found on this device."
            : "Could not start the camera or the face detector. Try Chrome or Safari, and reload the page.",
      );
    }

    const landmarker = landmarkerRef.current!;
    const video = videoRef.current!;
    const liveness = new LivenessSession(pickChallenges(3));
    const plan = new CapturePlan(350);
    const pitchSamples: number[] = [];
    const images: Blob[] = [];
    const poses: Pose[] = [];
    let thumb: Blob | null = null;
    let livenessResult: { challenges: Challenge[]; durationMs: number } | null = null;
    let captureStart = 0;
    let lastFaceAt = performance.now();
    let grabbing = false;
    let lastVideoTime = -1;
    let shown = "";

    const show = (patch: Partial<Ui>) => {
      const key = JSON.stringify(patch);
      if (key !== shown) {
        shown = key;
        setUi((u) => ({ ...u, ...patch }));
      }
    };

    const tick = () => {
      rafRef.current = requestAnimationFrame(tick);
      if (video.currentTime === lastVideoTime || grabbing) return;
      lastVideoTime = video.currentTime;
      const t = performance.now();
      const f = extractFeatures(landmarker, video, t);
      const g = guidance(f);
      if (f.faces > 0) lastFaceAt = t;

      if (!livenessResult) {
        const st = liveness.feed(f);
        if (g === "ok" && Math.abs(f.yaw) < 0.08) pitchSamples.push(f.pitch);
        if (st.status === "failed") return fail(`Liveness check failed: ${FAILURE_TEXT[st.reason]} Tap "Try again".`);
        if (st.status === "passed") {
          livenessResult = { challenges: st.challenges, durationMs: st.durationMs };
          captureStart = t;
          return show({ phase: "capture", challenge: null, pose: plan.target, hint: g });
        }
        return show({ phase: "liveness", challenge: st.challenge, challengeNo: st.index + 1, hint: g === "ok" ? null : g });
      }

      // Capture: the same person must stay in view (no swapping after liveness).
      if (t - lastFaceAt > FACE_LOST_MS) return fail(`${FAILURE_TEXT.face_lost} Tap "Try again".`);
      if (f.faces > 1) return fail(`${FAILURE_TEXT.multiple_faces} Tap "Try again".`);
      if (t - captureStart > CAPTURE_TIMEOUT_MS) return fail("Photo capture took too long. Tap \"Try again\" and follow the arrows.");
      if (plan.target === "front" && g === "ok" && Math.abs(f.yaw) < 0.08) pitchSamples.push(f.pitch);
      const neutral = neutralPitch(pitchSamples) ?? f.pitch;
      if (plan.shouldCapture(f, f.pitch - neutral, g === "ok")) {
        grabbing = true;
        const shot = plan.record(t);
        void (async () => {
          try {
            images.push(await grabJpeg(video, 720, 0.85));
            poses.push(shot.pose);
            if (!thumb && shot.pose === "front") thumb = await grabJpeg(video, 160, 0.7);
          } finally {
            grabbing = false;
          }
          if (plan.done) {
            stop();
            void upload(images, poses, thumb, livenessResult!);
          }
        })();
      }
      show({ phase: "capture", pose: plan.target, shots: plan.shots.length, hint: g === "ok" ? null : g });
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [fail, stop, upload]);

  const live = ui.phase === "loading" || ui.phase === "liveness" || ui.phase === "capture";

  return (
    <div className="space-y-4">
      <div className="relative mx-auto aspect-[3/4] w-full max-w-sm overflow-hidden rounded-2xl bg-black">
        <video ref={videoRef} playsInline muted className={`h-full w-full -scale-x-100 object-cover ${live ? "" : "opacity-30"}`} />
        <div className="pointer-events-none absolute inset-[12%_15%] rounded-[50%] border-4 border-white/70" />
        {live && (
          <div className="absolute inset-x-0 bottom-0 bg-black/60 p-3 text-center text-white">
            {ui.phase === "loading" && <p>Starting the camera…</p>}
            {ui.phase === "liveness" && ui.challenge && (
              <>
                <p className="text-xs uppercase tracking-wide opacity-80">Liveness check {ui.challengeNo}/3</p>
                <p className="text-lg font-semibold">{CHALLENGE_TEXT[ui.challenge]}</p>
              </>
            )}
            {ui.phase === "capture" && ui.pose && (
              <>
                <p className="text-xs uppercase tracking-wide opacity-80">
                  Photos {ui.shots}/{TOTAL_SHOTS}
                </p>
                <p className="text-lg font-semibold">{POSE_TEXT[ui.pose]}</p>
              </>
            )}
            {ui.hint && <p className="mt-1 text-sm text-amber-300">{GUIDANCE_TEXT[ui.hint]}</p>}
          </div>
        )}
        {ui.phase === "capture" && (
          <div className="absolute inset-x-0 top-0 h-1.5 bg-white/20">
            <div className="h-full bg-green-500 transition-all" style={{ width: `${(ui.shots / TOTAL_SHOTS) * 100}%` }} />
          </div>
        )}
      </div>

      {ui.phase === "idle" && (
        <div className="space-y-2 text-sm">
          <p>Hold the phone at eye level in good, even light. Remove sunglasses or a mask. You will be asked to do 3 short actions, then hold a few head angles while 10 photos are taken automatically.</p>
          <Button className="w-full" onClick={start}>
            Start camera
          </Button>
        </div>
      )}
      {ui.phase === "uploading" && <p className="text-center text-sm">Checking your photos… this can take up to 20 seconds.</p>}
      {(ui.phase === "done" || ui.phase === "error") && (
        <div className={`rounded-lg border p-3 text-sm ${ui.phase === "error" ? "border-destructive text-destructive" : "border-green-600"}`} role="status">
          <p>{ui.message}</p>
          {ui.dropped.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-muted-foreground">
              {ui.dropped.map((d) => (
                <li key={d.index}>
                  Photo {d.index + 1} ({d.pose}): {REJECTION_TEXT[d.reason] ?? d.reason}
                </li>
              ))}
            </ul>
          )}
          {ui.phase === "error" && (
            <Button className="mt-3 w-full" onClick={start}>
              Try again
            </Button>
          )}
          {ui.phase === "done" && (
            <Button className="mt-3 w-full" variant="outline" onClick={() => window.location.reload()}>
              Show my status
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
