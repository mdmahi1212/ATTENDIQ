/**
 * Live class counters (ARCHITECTURE "Mismatch handling"): V = verified present (present + late),
 * C = latest stable inside count minus staff. Pure, mirrors run_count_checks for the banner.
 */
export type LiveStatus = "pending" | "present" | "late" | "absent" | "left_early" | "excused";
export type OccupancySample = { smoothed: number; stable: boolean; ts: string } | null;

export type Mismatch =
  | { kind: "none" }
  | { kind: "no_count" }
  | { kind: "unstable"; c: number }
  | { kind: "more_than_verified"; extra: number } // C > V: some people were not recognised -> verify request
  | { kind: "fewer_than_verified"; missing: number } // C < V - tolerance: someone left -> recheck
  | { kind: "over_enrolled"; extra: number };

export type Counters = { verified: number; counted: number | null; enrolled: number; pending: number; mismatch: Mismatch };

export function counters(statuses: LiveStatus[], sample: OccupancySample, staffCount: number, tolerance = 1): Counters {
  const verified = statuses.filter((s) => s === "present" || s === "late").length;
  const pending = statuses.filter((s) => s === "pending").length;
  const enrolled = statuses.length;
  if (!sample) return { verified, counted: null, enrolled, pending, mismatch: { kind: "no_count" } };
  const c = Math.max(0, sample.smoothed - staffCount);
  let mismatch: Mismatch = { kind: "none" };
  if (!sample.stable) mismatch = { kind: "unstable", c };
  else if (c > enrolled) mismatch = { kind: "over_enrolled", extra: c - enrolled };
  else if (c > verified) mismatch = { kind: "more_than_verified", extra: c - verified };
  else if (c < verified - tolerance) mismatch = { kind: "fewer_than_verified", missing: verified - c };
  return { verified, counted: c, enrolled, pending, mismatch };
}

export function mismatchText(m: Mismatch): string | null {
  switch (m.kind) {
    case "more_than_verified":
      return `${m.extra} more ${m.extra === 1 ? "person is" : "people are"} in the room than verified: send a verify request to pending students.`;
    case "fewer_than_verified":
      return `${m.missing} fewer ${m.missing === 1 ? "person" : "people"} counted than verified: someone may have left. Consider a recheck.`;
    case "over_enrolled":
      return `More people than enrolled students (${m.extra} extra): visitors or the wrong room. Nobody is marked automatically.`;
    case "unstable":
      return null;
    default:
      return null;
  }
}

/** Seconds left in a window, never negative. */
export function secondsLeft(closesAt: string, nowMs: number): number {
  return Math.max(0, Math.round((Date.parse(closesAt) - nowMs) / 1000));
}
