"use client";

import { deviceId } from "@/lib/device-id";
import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { guidance, GUIDANCE_TEXT, type Guidance } from "@/lib/face/features";
import { extractFeatures, grabJpeg, loadLandmarker } from "@/lib/face/landmarker";
import { CHALLENGE_TEXT, LivenessSession, pickChallenges, type Challenge } from "@/lib/face/liveness";
import { REASON_TEXT, type VerifyReason } from "@/lib/verify/decision";

type Step = "location" | "seat" | "qr" | "face" | "submitting" | "result";
type Fix = { lat: number; lng: number; accuracy: number } | null;
type Result = { pass: boolean; status?: string | null; reasons: VerifyReason[]; attemptsLeft: number; error?: string };

const QR_PREFIX = "aiq1.";

export function VerifyFlow(props: {
  requestId: string;
  closesAt: string;
  serverNow: string;
  requireQr: boolean;
  attemptsLeft: number;
  faceEnrolled: boolean;
}) {
  const [step, setStep] = useState<Step>("location");
  const [left, setLeft] = useState<number | null>(null);
  const [fix, setFix] = useState<Fix>(null);
  const [gpsMsg, setGpsMsg] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [seat, setSeat] = useState<{ x: number; y: number } | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [attemptsLeft, setAttemptsLeft] = useState(props.attemptsLeft);
  const [manualSent, setManualSent] = useState(false);

  // Countdown on server time (the phone clock may be wrong).
  useEffect(() => {
    const offset = Date.parse(props.serverNow) - Date.now();
    const update = () => setLeft(Math.max(0, Math.round((Date.parse(props.closesAt) - (Date.now() + offset)) / 1000)));
    const t = setInterval(update, 1000);
    const first = setTimeout(update, 0);
    return () => {
      clearInterval(t);
      clearTimeout(first);
    };
  }, [props.closesAt, props.serverNow]);

  const locate = () => {
    setGpsMsg("Getting your location…");
    if (!("geolocation" in navigator)) {
      setGpsMsg("This browser has no location access. Continue with the room QR.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setFix({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy });
        setGpsMsg(`Location found (accuracy ±${Math.round(p.coords.accuracy)} m).`);
      },
      (e) => setGpsMsg(e.code === e.PERMISSION_DENIED ? "Location permission denied. Continue with the room QR." : "Could not get a location fix. Continue with the room QR."),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  };

  const submit = useCallback(
    async (frame: Blob, liveness: { challenges: Challenge[]; durationMs: number }) => {
      setStep("submitting");
      const form = new FormData();
      form.append("frame", frame, "frame.jpg");
      form.append(
        "meta",
        JSON.stringify({
          liveness: { passed: true, challenges: liveness.challenges, duration_ms: Math.round(liveness.durationMs) },
          lat: fix?.lat ?? null,
          lng: fix?.lng ?? null,
          accuracy: fix?.accuracy ?? null,
          qr_token: qr,
          seat,
          device_id: deviceId(),
        }),
      );
      try {
        const res = await fetch(`/api/verify/${props.requestId}`, { method: "POST", body: form });
        const body = (await res.json().catch(() => ({}))) as {
          pass?: boolean;
          status?: string | null;
          reasons?: VerifyReason[];
          attempts_left?: number;
          error?: string;
        };
        const al = body.attempts_left ?? (res.status === 429 ? 0 : attemptsLeft);
        setAttemptsLeft(al);
        setResult(res.ok ? { pass: !!body.pass, status: body.status, reasons: body.reasons ?? [], attemptsLeft: al } : { pass: false, reasons: [], attemptsLeft: al, error: body.error ?? `HTTP ${res.status}` });
      } catch {
        setResult({ pass: false, reasons: [], attemptsLeft, error: "Network error. Check your connection and try again." });
      }
      setStep("result");
    },
    [attemptsLeft, fix, props.requestId, qr, seat],
  );

  const requestManual = async () => {
    const res = await fetch(`/api/verify/${props.requestId}/manual`, { method: "POST" });
    setManualSent(res.ok);
  };

  const closed = left === 0;

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className={`rounded-lg border p-3 text-center text-sm ${left !== null && left < 60 ? "border-red-300 bg-red-50" : ""}`}>
        {closed ? "The window has closed." : `Time left: ${left === null ? "…" : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`}`}
      </div>

      {!props.faceEnrolled && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
          Your face is not enrolled (or is waiting for review), so the face check cannot pass.{" "}
          <ManualButton sent={manualSent} onClick={requestManual} />
        </div>
      )}

      {step === "location" && (
        <section className="space-y-2 rounded-lg border p-4 text-sm">
          <h2 className="font-semibold">1. Location</h2>
          <p className="text-muted-foreground">Supporting check: are you near the classroom?</p>
          {gpsMsg && <p>{gpsMsg}</p>}
          <div className="flex gap-2">
            <Button onClick={locate} variant={fix ? "outline" : "default"}>
              {fix ? "Try again" : "Share my location"}
            </Button>
            <Button onClick={() => setStep("seat")} variant={fix ? "default" : "outline"} disabled={closed}>
              Next
            </Button>
          </div>
        </section>
      )}

      {step === "seat" && (
        <SeatStep
          requestId={props.requestId}
          onSeat={(p) => {
            setSeat(p);
            setQr(null);
            setStep("face");
          }}
          onQr={() => {
            setSeat(null);
            setStep("qr");
          }}
        />
      )}

      {step === "qr" && (
        <QrStep
          requireQr={props.requireQr}
          onToken={(t) => {
            setQr(t);
            setStep("face");
          }}
          onSkip={() => setStep("face")}
        />
      )}

      {step === "face" && <FaceStep onDone={submit} />}

      {step === "submitting" && <p className="rounded-lg border p-4 text-center text-sm">Checking… (a few seconds)</p>}

      {step === "result" && result && (
        <section className={`space-y-2 rounded-lg border p-4 text-sm ${result.pass ? "border-green-600" : "border-destructive"}`} role="status">
          {result.pass ? (
            <p className="font-semibold text-green-700">Verified{result.status ? `: you are marked ${result.status}` : ""}. You can close this page.</p>
          ) : (
            <>
              <p className="font-semibold text-destructive">Not verified.</p>
              {result.error && <p>{result.error}</p>}
              <ul className="list-disc pl-5">
                {result.reasons.map((r) => (
                  <li key={r}>{REASON_TEXT[r] ?? r}</li>
                ))}
              </ul>
              <p className="text-muted-foreground">Attempts left: {Math.max(0, result.attemptsLeft)}</p>
              <div className="flex flex-wrap gap-2">
                {result.attemptsLeft > 0 && !closed && (
                  <Button
                    onClick={() => {
                      setResult(null);
                      setQr(null);
                      setSeat(null);
                      setStep("seat");
                    }}
                  >
                    Try again
                  </Button>
                )}
                <ManualButton sent={manualSent} onClick={requestManual} />
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}

function ManualButton({ sent, onClick }: { sent: boolean; onClick: () => void }) {
  return sent ? (
    <span className="text-green-700">Your professor was asked to check you manually.</span>
  ) : (
    <Button variant="outline" size="sm" onClick={onClick}>
      Request manual check
    </Button>
  );
}

/** Rear camera QR scan of the projector code (html5-qrcode, loaded only in the browser). */
function QrStep({ requireQr, onToken, onSkip }: { requireQr: boolean; onToken: (t: string) => void; onSkip: () => void }) {
  const [msg, setMsg] = useState("Starting the camera…");
  const done = useRef(false);
  const onTokenRef = useRef(onToken);
  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useEffect(() => {
    let scanner: import("html5-qrcode").Html5Qrcode | null = null;
    let stopped = false;
    (async () => {
      const { Html5Qrcode } = await import("html5-qrcode");
      if (stopped) return;
      scanner = new Html5Qrcode("qr-reader", false);
      try {
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: 240 },
          (text) => {
            if (done.current) return;
            if (!text.startsWith(QR_PREFIX)) {
              setMsg("That is not the class code. Scan the QR on the projector.");
              return;
            }
            done.current = true;
            void scanner?.stop().catch(() => undefined).then(() => onTokenRef.current(text.trim()));
          },
          () => undefined,
        );
        setMsg("Point the camera at the QR code on the projector.");
      } catch {
        setMsg("Could not open the rear camera. Allow camera access and reload.");
      }
    })();
    return () => {
      stopped = true;
      if (scanner?.isScanning) void scanner.stop().catch(() => undefined);
    };
  }, []); // start the camera once per step; the callback is read through a ref

  return (
    <section className="space-y-2 rounded-lg border p-4 text-sm">
      <h2 className="font-semibold">2. Room code (instead of the seat)</h2>
      <p>{msg}</p>
      <div id="qr-reader" className="overflow-hidden rounded-lg" />
      {!requireQr && (
        <Button variant="outline" onClick={onSkip}>
          Skip (use location only)
        </Button>
      )}
    </section>
  );
}

/** Front camera: random 2-step liveness, then one straight-on frame is sent for 1:1 matching. */
function FaceStep({ onDone }: { onDone: (frame: Blob, l: { challenges: Challenge[]; durationMs: number }) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lmRef = useRef<FaceLandmarker | null>(null);
  const raf = useRef(0);
  const [phase, setPhase] = useState<"idle" | "running" | "error">("idle");
  const [text, setText] = useState<string>("");
  const [hint, setHint] = useState<Guidance | null>(null);

  const stop = useCallback(() => {
    cancelAnimationFrame(raf.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);
  useEffect(
    () => () => {
      stop();
      lmRef.current?.close();
    },
    [stop],
  );

  const start = async () => {
    setPhase("running");
    setText("Starting the camera…");
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      const video = videoRef.current!;
      video.srcObject = streamRef.current;
      await video.play();
      lmRef.current ??= await loadLandmarker();
    } catch {
      stop();
      setPhase("error");
      setText("Could not start the front camera or the face detector. Allow camera access and reload.");
      return;
    }
    const video = videoRef.current!;
    const lm = lmRef.current!;
    const session = new LivenessSession(pickChallenges(2));
    let lastT = -1;
    let passedAt: number | null = null;
    let result: { challenges: Challenge[]; durationMs: number } | null = null;
    let shown = "";
    const show = (t: string, h: Guidance | null) => {
      const k = `${t}|${h}`;
      if (k !== shown) {
        shown = k;
        setText(t);
        setHint(h);
      }
    };
    const tick = () => {
      raf.current = requestAnimationFrame(tick);
      if (video.currentTime === lastT) return;
      lastT = video.currentTime;
      const t = performance.now();
      const f = extractFeatures(lm, video, t);
      const g = guidance(f);
      if (!result) {
        const st = session.feed(f);
        if (st.status === "failed") {
          stop();
          setPhase("error");
          setText("The liveness check did not pass (time ran out, face left the frame, or another face appeared). Try again.");
          return;
        }
        if (st.status === "passed") {
          result = { challenges: st.challenges, durationMs: st.durationMs };
          passedAt = t;
        } else {
          show(`${st.index + 1}/${st.total}: ${CHALLENGE_TEXT[st.challenge]}`, g === "ok" ? null : g);
          return;
        }
      }
      // After liveness: one straight-on, well-framed frame (wait up to 4 s for it).
      show("Look straight at the camera", g === "ok" ? null : g);
      const straight = g === "ok" && Math.abs(f.yaw) < 0.1;
      if (straight || (passedAt !== null && t - passedAt > 4000 && f.faces === 1)) {
        cancelAnimationFrame(raf.current);
        const l = result;
        void grabJpeg(video, 720, 0.85).then((jpg) => {
          stop();
          onDone(jpg, l);
        });
      }
    };
    raf.current = requestAnimationFrame(tick);
  };

  return (
    <section className="space-y-2 rounded-lg border p-4 text-sm">
      <h2 className="font-semibold">3. Face check</h2>
      <div className="relative mx-auto aspect-[3/4] w-full max-w-xs overflow-hidden rounded-2xl bg-black">
        <video ref={videoRef} playsInline muted className="h-full w-full -scale-x-100 object-cover" />
        {phase === "running" && (
          <div className="absolute inset-x-0 bottom-0 bg-black/60 p-2 text-center text-white">
            <p className="font-semibold">{text}</p>
            {hint && <p className="text-xs text-amber-300">{GUIDANCE_TEXT[hint]}</p>}
          </div>
        )}
      </div>
      {phase === "error" && <p className="text-destructive">{text}</p>}
      {phase !== "running" && <Button onClick={start}>{phase === "error" ? "Try again" : "Start face check"}</Button>}
    </section>
  );
}


/** "Tap your seat": dots = people the room camera sees right now (positions only). No dots -> scan the QR. */
function SeatStep({ requestId, onSeat, onQr }: { requestId: string; onSeat: (p: { x: number; y: number }) => void; onQr: () => void }) {
  const [dots, setDots] = useState<{ x: number; y: number; taken: boolean }[] | null>(null);
  useEffect(() => {
    let stop = false;
    const load = async () => {
      const res = await fetch(`/api/verify/${requestId}/seats`, { cache: "no-store" }).catch(() => null);
      const body = (await res?.json().catch(() => null)) as { dots?: { x: number; y: number; taken: boolean }[] } | null;
      if (!stop) setDots(body?.dots ?? []);
    };
    load();
    const t = setInterval(load, 10_000); // the room camera sends positions every ~10 s
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [requestId]);

  return (
    <section className="space-y-3 rounded-lg border p-4 text-sm" data-testid="seat-step">
      <h2 className="font-semibold">2. Tap your seat</h2>
      {dots === null ? (
        <p className="text-muted-foreground">Loading the room…</p>
      ) : dots.length === 0 ? (
        <p className="text-muted-foreground">The room camera does not see anyone right now. Scan the room QR instead.</p>
      ) : (
        <>
          <p className="text-muted-foreground">Each dot is a person the room camera sees (the room from the front). Tap the one that is you.</p>
          <svg viewBox="0 0 160 90" className="w-full rounded-lg border bg-muted/40" role="img" aria-label="People in the room">
            {dots.map((d, i) => (
              <circle
                key={i}
                cx={d.x * 160}
                cy={Math.min(85, d.y * 90)}
                r="5"
                className={d.taken ? "fill-slate-300" : "cursor-pointer fill-primary"}
                onClick={d.taken ? undefined : () => onSeat({ x: d.x, y: d.y })}
              >
                <title>{d.taken ? "someone else" : "tap if this is you"}</title>
              </circle>
            ))}
          </svg>
          <p className="text-xs text-muted-foreground">Grey dots are people the camera already knows.</p>
        </>
      )}
      <Button variant="outline" onClick={onQr}>
        Scan the room QR instead
      </Button>
    </section>
  );
}
