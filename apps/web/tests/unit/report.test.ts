import { describe, expect, it } from "vitest";
import { summarize, type ReportInput } from "@/lib/report";

const row = (student_id: string, status: ReportInput["status"]): ReportInput => ({
  student_id,
  status,
  full_name: student_id.toUpperCase(),
  student_no: null,
  is_simulated: false,
});

describe("attendance % (same formula as SQL attendance_summary)", () => {
  const rows = [
    row("a", "present"),
    row("a", "late"),
    row("a", "absent"),
    row("a", "excused"),
    row("a", "left_early"),
    row("a", "pending"), // under review: not counted as held
    row("b", "absent"),
  ];

  it("default policy: late = 1, left early = absent", () => {
    const [a, b] = summarize(rows, { lateWeight: 1, leftEarly: "absent" });
    expect(a).toMatchObject({ held: 5, present: 1, late: 1, absent: 1, excused: 1, left_early: 1, pending: 1, pct: 60 });
    expect(b).toMatchObject({ held: 1, pct: 0 });
  });

  it("late weight and partial left-early change the score", () => {
    const [a] = summarize(rows, { lateWeight: 0.5, leftEarly: "partial" });
    // (1 + 0.5 + 1 + 0.5) / 5 = 60 %
    expect(a.pct).toBe(60);
    const [a2] = summarize(rows, { lateWeight: 0, leftEarly: "absent" });
    expect(a2.pct).toBe(40);
  });

  it("a student with only pending rows has no percentage", () => {
    expect(summarize([row("c", "pending")], { lateWeight: 1, leftEarly: "absent" })[0].pct).toBeNull();
  });
});
