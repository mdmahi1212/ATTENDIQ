import { describe, expect, it } from "vitest";
import { insideAt, timeInClass, type DoorEvent } from "@/lib/dashboard";

const M = 60_000;
const T0 = Date.UTC(2026, 10, 22, 1, 30);
const ev = (type: "in" | "out", student: string, min: number): DoorEvent => ({ type, student, at: T0 + min * M });

describe("timeInClass (door events only)", () => {
  it("in, out, back in: sums the inside segments up to the class end", () => {
    const r = timeInClass([ev("in", "a", 0), ev("out", "a", 22), ev("in", "a", 35)], T0, T0 + 75 * M).get("a")!;
    expect(r.minutes).toBe(22 + 40);
    expect(r.segments).toHaveLength(2);
    expect(r.inNow).toBe(true);
    expect(r.lastOut).toBe(T0 + 22 * M);
  });

  it("left and never came back: stops at the exit", () => {
    const r = timeInClass([ev("in", "b", 5), ev("out", "b", 30)], T0, T0 + 75 * M).get("b")!;
    expect(r.minutes).toBe(25);
    expect(r.inNow).toBe(false);
  });

  it("clips to the class window and ignores repeated entries", () => {
    const r = timeInClass([ev("in", "c", -10), ev("in", "c", 3), ev("out", "c", 90)], T0, T0 + 75 * M).get("c")!;
    expect(r.minutes).toBe(75);
  });

  it("counts only up to 'now' for a live class", () => {
    expect(timeInClass([ev("in", "d", 10)], T0, T0 + 30 * M).get("d")!.minutes).toBe(20);
  });

  it("uses the fallback entry time (self-verify) when there is no door event", () => {
    const r = timeInClass([], T0, T0 + 60 * M, new Map([["e", T0 + 12 * M]])).get("e")!;
    expect(r.minutes).toBe(48);
  });

  it("an exit without an entry adds no time", () => {
    expect(timeInClass([ev("out", "f", 20)], T0, T0 + 60 * M).get("f")!.minutes).toBe(0);
  });

  it("insideAt counts students inside at a moment", () => {
    const t = timeInClass([ev("in", "a", 0), ev("out", "a", 20), ev("in", "b", 5)], T0, T0 + 60 * M);
    expect(insideAt(t, T0 + 10 * M)).toBe(2);
    expect(insideAt(t, T0 + 30 * M)).toBe(1);
  });
});

describe("minutesAgoIso", () => {
  it("goes back the given minutes", async () => {
    const { minutesAgoIso } = await import("@/lib/dashboard");
    expect(minutesAgoIso(5, new Date("2026-11-23T10:00:00Z"))).toBe("2026-11-23T09:55:00.000Z");
  });
});
