import { z } from "zod";

/** Edge event types the server accepts (same list as apply_edge_events). */
export const EDGE_EVENT_TYPES = [
  "GATE_PERSON_IN",
  "GATE_PERSON_OUT",
  "GATE_ENTRY_RECOGNISED",
  "GATE_ENTRY_UNKNOWN",
  "OCCUPANCY_UPDATED",
  "CAMERA_OFFLINE",
  "CAMERA_ONLINE",
  "EDGE_HEARTBEAT",
] as const;

export const MAX_BATCH = 500;

/**
 * Shape check only: one bad envelope must not sink the whole batch, so per-event validation
 * (types, device/room/session rules, future timestamps) happens in apply_edge_events, which reports
 * each rejected event_id with a reason.
 */
export const eventBatchSchema = z.union([
  z.array(z.record(z.string(), z.unknown())).max(MAX_BATCH),
  z.object({ events: z.array(z.record(z.string(), z.unknown())).max(MAX_BATCH) }).transform((b) => b.events),
]);

export const roomCodeSchema = z.string().regex(/^[A-Za-z0-9_-]{1,20}$/);

export const heartbeatSchema = z.object({
  status: z.record(z.string(), z.unknown()).default({}),
  observed_at: z.iso.datetime({ offset: true }).optional(),
});

export const demoSessionSchema = z.object({
  section_id: z.guid().optional(),
  /** Session T0 relative to now (minutes ago). A simulator replays a past class with past timestamps. */
  started_minutes_ago: z.number().int().min(0).max(120).default(0),
  minutes: z.number().int().min(10).max(240).default(75),
});

export type RpcBatchResult = { accepted: number; duplicates: number; rejected: { event_id: string | null; reason: string }[] };
