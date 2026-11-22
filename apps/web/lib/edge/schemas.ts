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

/** Recorded-video presentation: the edge starts a REAL class for its room, replays the videos, then ends it. */
export const replaySessionSchema = z.object({
  /** "IOT401-01" (course code + section no). Default: the room's section with the most real students with an active face. */
  section: z.string().regex(/^[A-Za-z0-9]{1,20}-[A-Za-z0-9]{1,10}$/).optional(),
  /** Scheduled length; the edge ends it early when the videos finish (or waits for it with --full-class). DB minimum 10. */
  minutes: z.number().int().min(10).max(60).default(10),
  /** Compress the class rules into ~10 minutes (DEMO_POLICY) so every rule fires during a short recorded demo. */
  demo_timing: z.boolean().default(false),
  /** People counted by the room camera who are not students (professor). Real classes default to 1. */
  staff_count: z.number().int().min(0).max(5).default(1),
});

/**
 * Demo timing for one recorded-video class: the same rules as a real class, compressed so that present / late,
 * the count check (push to unmarked students) and the professor's end-of-class alert all happen in ~10 minutes.
 * Real (timetable) classes never use this.
 */
export const DEMO_POLICY = {
  present_until_min: 2,
  late_until_min: 5,
  first_mismatch_check_min: 2,
  mismatch_interval_min: 1,
  verify_window_min: 3,
  recheck_before_end_min: 2,
  recheck_window_min: 2,
} as const;

/** Off unless EDGE_REPLAY_SESSIONS=true on the server: lets an edge device key start and end real classes. */
export function replaySessionsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.EDGE_REPLAY_SESSIONS === "true";
}

export type RpcBatchResult = { accepted: number; duplicates: number; rejected: { event_id: string | null; reason: string }[] };
