import type { Json } from "@/lib/database.types";

/** Heartbeat payload as sent by apps/edge (heartbeat.py). Every field is optional. */
export type HeartbeatStatus = {
  cpu?: number;
  fps?: { gate?: number; inside?: number };
  frame_age_ms?: { gate?: number; inside?: number } | number;
  outbox?: number;
  reconnects?: number;
};

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** Defensive parse of edge_devices.status (it comes from a device, never trust its shape). */
export function parseHeartbeat(status: Json | null): HeartbeatStatus {
  if (!status || typeof status !== "object" || Array.isArray(status)) return {};
  const s = status as Record<string, unknown>;
  const pair = (v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? { gate: num((v as Record<string, unknown>).gate), inside: num((v as Record<string, unknown>).inside) }
      : undefined;
  return {
    cpu: num(s.cpu),
    fps: pair(s.fps),
    frame_age_ms: num(s.frame_age_ms) ?? pair(s.frame_age_ms),
    outbox: num(s.outbox),
    reconnects: num(s.reconnects),
  };
}

export function fmtPair(p: { gate?: number; inside?: number } | number | undefined, unit = ""): string {
  if (p === undefined) return "—";
  if (typeof p === "number") return `${Math.round(p)}${unit}`;
  const f = (v?: number) => (v === undefined ? "—" : `${Math.round(v * 10) / 10}${unit}`);
  return `gate ${f(p.gate)} · inside ${f(p.inside)}`;
}
