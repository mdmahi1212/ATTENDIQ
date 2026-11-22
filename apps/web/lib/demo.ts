/**
 * Recorded-video demo class: a real 10-minute class whose rules run on a shortened clock, so a ~9-minute
 * recording shows every rule (present, late, count check, professor alert at the end, left and not back).
 * Applied as per-session policy overrides (they win over the global `settings.policy`).
 */
export const DEMO_MINUTES = 10;

export const DEMO_POLICY = {
  present_until_min: 2, // walk in within 2 min -> present
  late_until_min: 8, // 2-8 min -> late
  first_mismatch_check_min: 2, // room count vs verified from minute 2
  mismatch_interval_min: 2,
  count_tolerance: 0, // with 2-5 people one hidden face must already trigger "verify now"
  stable_count_seconds: 30,
  verify_window_min: 3,
  recheck_window_min: 2,
  recheck_before_end_min: 3, // professor alert at minute 7
} as const satisfies Record<string, number>;

/** Merges the demo overrides over the session's policy (keeps every other key). */
export function withDemoPolicy(policy: unknown): Record<string, unknown> {
  const base = policy && typeof policy === "object" && !Array.isArray(policy) ? (policy as Record<string, unknown>) : {};
  return { ...base, ...DEMO_POLICY };
}
