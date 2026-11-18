import { describe, expect, it } from "vitest";
import { counters, mismatchText, secondsLeft, type LiveStatus } from "@/lib/session-live";

const roster = (p: number, l: number, pend: number): LiveStatus[] => [
  ...Array<LiveStatus>(p).fill("present"),
  ...Array<LiveStatus>(l).fill("late"),
  ...Array<LiveStatus>(pend).fill("pending"),
];
const s = (n: number, stable = true) => ({ smoothed: n, stable, ts: "2026-11-18T02:00:00Z" });

describe("live counters", () => {
  it("V counts present + late; C subtracts staff", () => {
    const c = counters(roster(20, 5, 5), s(26), 1);
    expect(c).toMatchObject({ verified: 25, counted: 25, enrolled: 30, pending: 5, mismatch: { kind: "none" } });
  });
  it("C > V -> verify request", () => {
    expect(counters(roster(20, 0, 10), s(24), 1).mismatch).toEqual({ kind: "more_than_verified", extra: 3 });
  });
  it("C < V beyond tolerance -> recheck; within tolerance -> none", () => {
    expect(counters(roster(20, 0, 0), s(18), 1, 1).mismatch).toEqual({ kind: "fewer_than_verified", missing: 3 });
    expect(counters(roster(20, 0, 0), s(20), 1, 1).mismatch).toEqual({ kind: "none" });
  });
  it("unstable counts never raise a banner; no sample = no count", () => {
    expect(counters(roster(20, 0, 10), s(29, false), 1).mismatch.kind).toBe("unstable");
    expect(mismatchText(counters(roster(20, 0, 10), s(29, false), 1).mismatch)).toBeNull();
    expect(counters(roster(1, 0, 0), null, 1)).toMatchObject({ counted: null, mismatch: { kind: "no_count" } });
  });
  it("more people than enrolled is reported separately", () => {
    expect(counters(roster(3, 0, 0), s(8), 1).mismatch).toEqual({ kind: "over_enrolled", extra: 4 });
  });
  it("seconds left", () => {
    expect(secondsLeft("2026-11-18T02:05:00Z", Date.parse("2026-11-18T02:04:30Z"))).toBe(30);
    expect(secondsLeft("2026-11-18T02:05:00Z", Date.parse("2026-11-18T02:06:00Z"))).toBe(0);
  });
});
