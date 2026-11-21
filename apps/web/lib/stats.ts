/** Attendance statistics for the dashboards (pure). Pending = not decided yet, excused = not counted. */

export type Att = "pending" | "present" | "late" | "absent" | "left_early" | "excused";

export type Rate = { attended: number; total: number; pct: number | null };

/** Present + late count as attended (late_weight 1, the default policy); left_early counts as absent. */
export function rateOf(statuses: Att[]): Rate {
  const decided = statuses.filter((s) => s !== "pending" && s !== "excused");
  const attended = decided.filter((s) => s === "present" || s === "late").length;
  return { attended, total: decided.length, pct: decided.length ? Math.round((attended / decided.length) * 100) : null };
}

export type DayBar = { date: string; present: number; late: number; absent: number };

/** One bar per day for the last `days` days ending at `today` (YYYY-MM-DD), oldest first. */
export function dailySeries(rows: { date: string; status: Att }[], today: string, days = 14): DayBar[] {
  const end = new Date(`${today}T00:00:00Z`).getTime();
  const out: DayBar[] = [];
  const byDate = new Map<string, DayBar>();
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(end - i * 86_400_000).toISOString().slice(0, 10);
    const bar = { date, present: 0, late: 0, absent: 0 };
    out.push(bar);
    byDate.set(date, bar);
  }
  for (const r of rows) {
    const bar = byDate.get(r.date);
    if (!bar) continue;
    if (r.status === "present") bar.present++;
    else if (r.status === "late") bar.late++;
    else if (r.status === "absent" || r.status === "left_early") bar.absent++;
  }
  return out;
}

export type AtRisk = { student: string; section: string; pct: number; total: number };

/** Students whose rate in a section is below the warning threshold (needs at least `minClasses` decided classes). */
export function atRisk(rows: { student: string; section: string; status: Att }[], warnPct = 85, minClasses = 2): AtRisk[] {
  const groups = new Map<string, { student: string; section: string; s: Att[] }>();
  for (const r of rows) {
    const k = `${r.student}|${r.section}`;
    const g = groups.get(k) ?? { student: r.student, section: r.section, s: [] };
    g.s.push(r.status);
    groups.set(k, g);
  }
  const out: AtRisk[] = [];
  for (const g of groups.values()) {
    const r = rateOf(g.s);
    if (r.pct !== null && r.total >= minClasses && r.pct < warnPct) out.push({ student: g.student, section: g.section, pct: r.pct, total: r.total });
  }
  return out.sort((a, b) => a.pct - b.pct);
}
