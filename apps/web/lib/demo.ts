/**
 * Demo classes: a real class whose rules run on a shortened clock, so a short recording (or a live walk-through)
 * shows every rule: present, late, room-count check -> "verify now", professor alert near the end, and
 * "left and not back" -> absent. Applied as per-session policy overrides (they win over `settings.policy`).
 * "Full class" uses the normal rules and the section's timetable length.
 */
export const DEMO_LENGTHS = [5, 10, 15] as const;
export type DemoLength = (typeof DEMO_LENGTHS)[number];
export const FULL_CLASS_DEFAULT_MIN = 75;

export type DemoPolicy = {
  present_until_min: number;
  late_until_min: number;
  first_mismatch_check_min: number;
  mismatch_interval_min: number;
  count_tolerance: number;
  stable_count_seconds: number;
  verify_window_min: number;
  recheck_window_min: number;
  recheck_before_end_min: number;
};

/** Timing for a short demo class of `minutes` (5-15). Every value is whole minutes, as the rule engine expects. */
export function demoPolicy(minutes: number): DemoPolicy {
  const m = Math.max(5, Math.min(15, Math.round(minutes)));
  const step = Math.max(1, Math.round(m * 0.2));
  return {
    present_until_min: step, // 5 -> 1, 10 -> 2, 15 -> 3
    late_until_min: Math.round(m * 0.8), // 5 -> 4, 10 -> 8, 15 -> 12
    first_mismatch_check_min: step,
    mismatch_interval_min: step,
    count_tolerance: 0, // with 2-5 people one hidden face must already trigger "verify now"
    stable_count_seconds: m <= 5 ? 20 : 30,
    verify_window_min: Math.max(2, Math.min(5, Math.round(m * 0.3))),
    recheck_window_min: step,
    recheck_before_end_min: Math.max(2, Math.round(m * 0.3)), // professor alert at 3 / 7 / 10-11 min
  };
}

/** Merges the demo overrides over the session's policy (keeps every other key). */
export function withDemoPolicy(policy: unknown, minutes: number): Record<string, unknown> {
  const base = policy && typeof policy === "object" && !Array.isArray(policy) ? (policy as Record<string, unknown>) : {};
  return { ...base, ...demoPolicy(minutes) };
}

/** Length of a full class: the section's longest timetable slot ("HH:MM[:SS]" times), else 75 minutes. */
export function fullClassMinutes(slots: { start_time: string; end_time: string }[]): number {
  const min = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const lengths = slots.map((s) => min(s.end_time) - min(s.start_time)).filter((n) => n >= 10 && n <= 240);
  return lengths.length ? Math.max(...lengths) : FULL_CLASS_DEFAULT_MIN;
}

/** One-line summary of a demo timing for buttons and confirmations. */
export function describeDemo(minutes: number): string {
  const p = demoPolicy(minutes);
  return `present until ${p.present_until_min} min, late until ${p.late_until_min}, count checks every ${p.mismatch_interval_min} min, professor alert at ${minutes - p.recheck_before_end_min} min`;
}
