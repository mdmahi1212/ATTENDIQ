import type { AttStatus } from "@/lib/status";

export type ReportInput = {
  student_id: string;
  full_name: string;
  student_no: string | null;
  is_simulated: boolean;
  status: AttStatus;
};

export type ReportRow = {
  student_id: string;
  full_name: string;
  student_no: string;
  held: number;
  present: number;
  late: number;
  absent: number;
  left_early: number;
  excused: number;
  pending: number;
  pct: number | null;
  is_simulated: boolean;
};

/**
 * Same formula as SQL attendance_summary(): pct = (present + late*late_weight + excused
 * + left_early*partial) / held, where pending rows (under review) are not counted as held.
 * Rows must already be limited to ended/locked (never cancelled) sessions.
 */
export function summarize(
  rows: ReportInput[],
  opts: { lateWeight: number; leftEarly: "absent" | "partial" },
): ReportRow[] {
  const by = new Map<string, ReportRow>();
  for (const r of rows) {
    const cur =
      by.get(r.student_id) ??
      ({
        student_id: r.student_id,
        full_name: r.full_name,
        student_no: r.student_no ?? "",
        held: 0,
        present: 0,
        late: 0,
        absent: 0,
        left_early: 0,
        excused: 0,
        pending: 0,
        pct: null,
        is_simulated: r.is_simulated,
      } satisfies ReportRow);
    cur[r.status] += 1;
    if (r.status !== "pending") cur.held += 1;
    by.set(r.student_id, cur);
  }
  const le = opts.leftEarly === "partial" ? 0.5 : 0;
  return [...by.values()]
    .map((r) => ({
      ...r,
      pct: r.held ? Math.round((1000 * (r.present + opts.lateWeight * r.late + r.excused + le * r.left_early)) / r.held) / 10 : null,
    }))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
}

export const REPORT_COLUMNS = ["student_no", "full_name", "held", "present", "late", "absent", "left_early", "excused", "pending", "pct"] as const;
