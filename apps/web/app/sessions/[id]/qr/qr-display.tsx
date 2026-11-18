"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";

type Qr = { token: string; expires_at: string; slot_seconds: number; server_now: string };

/** Fetches the current token from the server (server time only) and redraws when the slot rotates. */
export function QrDisplay({ sessionId }: { sessionId: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [left, setLeft] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    let expiresLocal = 0;
    const load = async () => {
      try {
        const res = await fetch(`/api/sessions/${sessionId}/qr`, { cache: "no-store" });
        const body = (await res.json()) as Qr & { error?: string };
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        // Convert the server's expiry into local time using the server/local offset (the laptop clock may be wrong).
        const offset = Date.parse(body.server_now) - Date.now();
        expiresLocal = Date.parse(body.expires_at) - offset;
        const out = await QRCode.toString(body.token, { type: "svg", errorCorrectionLevel: "M", margin: 2 });
        if (!stop) {
          setSvg(out);
          setError(null);
        }
        timer = setTimeout(load, Math.max(500, expiresLocal - Date.now() + 300));
      } catch (e) {
        if (!stop) setError((e as Error).message);
        timer = setTimeout(load, 3000);
      }
    };
    void load();
    const tick = setInterval(() => setLeft(Math.max(0, Math.ceil((expiresLocal - Date.now()) / 1000))), 250);
    return () => {
      stop = true;
      clearTimeout(timer);
      clearInterval(tick);
    };
  }, [sessionId]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-white p-6 text-black">
      <p className="text-2xl font-semibold">Scan to verify you are in this room</p>
      {error ? (
        <p className="text-red-700">QR unavailable: {error}</p>
      ) : svg ? (
        // SVG produced locally by the qrcode library from our own token (no user input).
        <div className="aspect-square w-[min(80vh,90vw)]" data-testid="room-qr" dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <p>Loading…</p>
      )}
      <p className="text-lg tabular-nums text-gray-600">Changes in {left} s</p>
    </div>
  );
}
