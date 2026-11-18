import { formatInTimeZone } from "date-fns-tz";

export const CAMPUS_TZ = "Asia/Seoul";

/** Format a UTC timestamp for display in campus time. */
export function fmtSeoul(ts: string | Date | null | undefined, pattern = "yyyy-MM-dd HH:mm"): string {
  if (!ts) return "—";
  return formatInTimeZone(typeof ts === "string" ? new Date(ts) : ts, CAMPUS_TZ, pattern);
}

/** Today's date (YYYY-MM-DD) in campus time. */
export function seoulToday(now: Date = new Date()): string {
  return formatInTimeZone(now, CAMPUS_TZ, "yyyy-MM-dd");
}

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
/** ISO weekday 1..7 -> label. */
export const weekdayLabel = (iso: number) => WEEKDAYS[(iso - 1 + 7) % 7];

/** "10:30:00" -> "10:30" */
export const hhmm = (t: string) => t.slice(0, 5);

/** Seconds since a timestamp (for device health), or null. */
export function ageSeconds(ts: string | null, now: Date = new Date()): number | null {
  if (!ts) return null;
  return Math.max(0, Math.round((now.getTime() - new Date(ts).getTime()) / 1000));
}
