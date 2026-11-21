import { describe, expect, it } from "vitest";
import { atRisk, dailySeries, rateOf } from "@/lib/stats";

describe("rateOf", () => {
  it("counts present + late as attended; pending and excused are not counted", () => {
    expect(rateOf(["present", "late", "absent", "left_early", "pending", "excused"])).toEqual({ attended: 2, total: 4, pct: 50 });
  });
  it("no decided classes -> null", () => {
    expect(rateOf(["pending"]).pct).toBeNull();
  });
});

describe("dailySeries", () => {
  it("one bar per day, oldest first, left_early counted as absent, out-of-range ignored", () => {
    const s = dailySeries(
      [
        { date: "2026-11-22", status: "present" },
        { date: "2026-11-22", status: "left_early" },
        { date: "2026-11-21", status: "late" },
        { date: "2026-10-01", status: "present" },
      ],
      "2026-11-22",
      3,
    );
    expect(s.map((d) => d.date)).toEqual(["2026-11-20", "2026-11-21", "2026-11-22"]);
    expect(s[2]).toEqual({ date: "2026-11-22", present: 1, late: 0, absent: 1 });
    expect(s[1].late).toBe(1);
  });
});

describe("atRisk", () => {
  it("lists students below the threshold with enough classes, worst first", () => {
    const rows = [
      ...["present", "absent", "absent"].map((status) => ({ student: "a", section: "x", status: status as "present" | "absent" })),
      ...["present", "present", "present"].map((status) => ({ student: "b", section: "x", status: status as "present" })),
      { student: "c", section: "x", status: "absent" as const }, // only 1 class: not enough yet
    ];
    expect(atRisk(rows)).toEqual([{ student: "a", section: "x", pct: 33, total: 3 }]);
  });
});
