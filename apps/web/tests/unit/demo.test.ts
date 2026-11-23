import { describe, expect, it } from "vitest";
import { DEMO_LENGTHS, demoPolicy, describeDemo, fullClassMinutes, withDemoPolicy } from "@/lib/demo";

describe("demo class timing", () => {
  it.each([...DEMO_LENGTHS, 6, 7, 8, 9, 11, 12, 13, 14])("keeps the rule order inside a %i-minute class", (m) => {
    const p = demoPolicy(m);
    expect(p.present_until_min).toBeGreaterThanOrEqual(1);
    expect(p.present_until_min).toBeLessThan(p.late_until_min);
    expect(p.late_until_min).toBeLessThan(m);
    expect(m - p.recheck_before_end_min).toBeGreaterThan(p.first_mismatch_check_min); // alert after the first check
    expect(p.verify_window_min).toBeLessThan(m - p.first_mismatch_check_min);
    expect(Object.values(p).every((v) => Number.isInteger(v))).toBe(true);
  });

  it("uses the agreed 10-minute timing", () => {
    expect(demoPolicy(10)).toMatchObject({ present_until_min: 2, late_until_min: 8, mismatch_interval_min: 2, recheck_before_end_min: 3 });
    expect(describeDemo(10)).toContain("professor alert at 7 min");
  });

  it("overrides only the timing keys and keeps the rest of the session policy", () => {
    const p = withDemoPolicy({ present_until_min: 10, appeal_days: 7, left_early_counts_as: "absent" }, 5);
    expect(p).toMatchObject({ ...demoPolicy(5), appeal_days: 7, left_early_counts_as: "absent" });
    expect(withDemoPolicy(null, 10)).toEqual({ ...demoPolicy(10) });
    expect(withDemoPolicy([1], 10)).toEqual({ ...demoPolicy(10) });
  });

  it("takes the full-class length from the timetable", () => {
    expect(fullClassMinutes([{ start_time: "09:00:00", end_time: "10:15:00" }, { start_time: "13:00", end_time: "13:50" }])).toBe(75);
    expect(fullClassMinutes([])).toBe(75);
    expect(fullClassMinutes([{ start_time: "09:00", end_time: "09:05" }])).toBe(75); // too short to be a class
  });
});
