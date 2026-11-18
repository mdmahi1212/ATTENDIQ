/** Pure helpers for the student portal (unit-tested). Times: timetable in Asia/Seoul (UTC+9, no DST). */

export type TimetableSlot = { weekday: number; start_time: string; end_time: string }; // ISO weekday 1=Mon
export type NextClass<T> = { item: T; slot: TimetableSlot; startsAt: Date; endsAt: Date; ongoing: boolean };

const SEOUL_OFFSET_MS = 9 * 3600_000;

/** Next (or ongoing) class across sections, searching the next 7 days. */
export function nextClass<T>(items: { item: T; slots: TimetableSlot[] }[], now: Date): NextClass<T> | null {
  const seoulNow = new Date(now.getTime() + SEOUL_OFFSET_MS); // shift so getUTC* reads Seoul wall time
  let best: NextClass<T> | null = null;
  for (let d = 0; d < 8; d++) {
    const day = new Date(Date.UTC(seoulNow.getUTCFullYear(), seoulNow.getUTCMonth(), seoulNow.getUTCDate() + d));
    const iso = ((day.getUTCDay() + 6) % 7) + 1;
    for (const { item, slots } of items)
      for (const slot of slots) {
        if (slot.weekday !== iso) continue;
        const at = (t: string) => {
          const [h, m] = t.split(":").map(Number);
          return new Date(day.getTime() + (h * 60 + m) * 60_000 - SEOUL_OFFSET_MS);
        };
        const startsAt = at(slot.start_time);
        const endsAt = at(slot.end_time);
        if (endsAt <= now) continue;
        if (!best || startsAt < best.startsAt) best = { item, slot, startsAt, endsAt, ongoing: startsAt <= now };
      }
    if (best) return best;
  }
  return best;
}

export type DayStatus = "present" | "late" | "absent" | "left_early" | "excused" | "pending";
const SEVERITY: Record<DayStatus, number> = { absent: 5, left_early: 4, late: 3, pending: 2, excused: 1, present: 0 };

/** Calendar heatmap: `weeks` columns ending this week (Mon..Sun rows). The worst status of the day wins. */
export function heatmap(rows: { date: string; status: DayStatus }[], today: string, weeks = 12): { date: string; status: DayStatus | null }[][] {
  const byDate = new Map<string, DayStatus>();
  for (const r of rows) {
    const cur = byDate.get(r.date);
    if (!cur || SEVERITY[r.status] > SEVERITY[cur]) byDate.set(r.date, r.status);
  }
  const t = new Date(`${today}T00:00:00Z`);
  const monday = new Date(t.getTime() - ((t.getUTCDay() + 6) % 7) * 86_400_000);
  const start = new Date(monday.getTime() - (weeks - 1) * 7 * 86_400_000);
  const cols: { date: string; status: DayStatus | null }[][] = [];
  for (let w = 0; w < weeks; w++) {
    const col = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(start.getTime() + (w * 7 + d) * 86_400_000).toISOString().slice(0, 10);
      col.push({ date, status: date > today ? null : (byDate.get(date) ?? null) });
    }
    cols.push(col);
  }
  return cols;
}

/** Can the student appeal this session now? */
export function appealOpen(
  s: { state: string; ends_at: string; status: string; appeal_days: number; has_open_appeal: boolean },
  now: Date,
): { ok: true } | { ok: false; why: string } {
  if (s.state !== "ended" && s.state !== "locked") return { ok: false, why: "class not finished" };
  if (s.has_open_appeal) return { ok: false, why: "appeal pending" };
  if (s.status === "present" || s.status === "excused") return { ok: false, why: "nothing to appeal" };
  if (now.getTime() > Date.parse(s.ends_at) + s.appeal_days * 86_400_000) return { ok: false, why: "appeal period over" };
  return { ok: true };
}
