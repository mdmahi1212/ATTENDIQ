import { describe, expect, it } from "vitest";
import { DEMO_MINUTES, DEMO_POLICY, withDemoPolicy } from "@/lib/demo";

describe("video demo class policy", () => {
  it("overrides only the timing keys and keeps the rest of the session policy", () => {
    const p = withDemoPolicy({ present_until_min: 10, late_until_min: 30, appeal_days: 7, left_early_counts_as: "absent" });
    expect(p).toMatchObject({ ...DEMO_POLICY, appeal_days: 7, left_early_counts_as: "absent" });
  });

  it("accepts a missing or non-object policy", () => {
    expect(withDemoPolicy(null)).toEqual({ ...DEMO_POLICY });
    expect(withDemoPolicy([1, 2])).toEqual({ ...DEMO_POLICY });
  });

  it("keeps the rule order inside the 10-minute class", () => {
    const d = DEMO_POLICY;
    expect(d.present_until_min).toBeLessThan(d.late_until_min);
    expect(d.late_until_min).toBeLessThanOrEqual(DEMO_MINUTES);
    expect(DEMO_MINUTES - d.recheck_before_end_min).toBeGreaterThan(d.first_mismatch_check_min);
    expect(d.verify_window_min).toBeLessThan(DEMO_MINUTES - d.first_mismatch_check_min);
  });
});
