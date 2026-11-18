import { describe, expect, it } from "vitest";
import { appealOpen, heatmap, nextClass } from "@/lib/student";

describe("next class (Asia/Seoul timetable)", () => {
  const items = [
    { item: "IOT401", slots: [{ weekday: 1, start_time: "10:30", end_time: "11:45" }, { weekday: 3, start_time: "10:30", end_time: "11:45" }] },
    { item: "AIE302", slots: [{ weekday: 2, start_time: "13:30", end_time: "14:45" }] },
  ];
  it("finds today's upcoming class (Wed 09:00 KST = Wed 00:00 UTC)", () => {
    const n = nextClass(items, new Date("2026-11-18T00:00:00Z"))!;
    expect(n.item).toBe("IOT401");
    expect(n.startsAt.toISOString()).toBe("2026-11-18T01:30:00.000Z");
    expect(n.ongoing).toBe(false);
  });
  it("reports an ongoing class", () => {
    expect(nextClass(items, new Date("2026-11-18T02:00:00Z"))!.ongoing).toBe(true);
  });
  it("after today's class it moves to the next weekday class (Tue AIE302 is 6 days away, Mon IOT401 5 days)", () => {
    const n = nextClass(items, new Date("2026-11-18T03:00:00Z"))!; // Wed 12:00 KST
    expect(n.item).toBe("IOT401");
    expect(n.startsAt.toISOString()).toBe("2026-11-23T01:30:00.000Z"); // Mon
  });
  it("no timetable -> null", () => {
    expect(nextClass([{ item: "x", slots: [] }], new Date())).toBeNull();
  });
});

describe("heatmap", () => {
  it("12 columns of 7 days ending in this week, worst status per day, future empty", () => {
    const h = heatmap(
      [
        { date: "2026-11-16", status: "present" },
        { date: "2026-11-16", status: "late" },
        { date: "2026-11-17", status: "absent" },
      ],
      "2026-11-18",
    );
    expect(h).toHaveLength(12);
    expect(h.every((c) => c.length === 7)).toBe(true);
    const last = h[11];
    expect(last[0]).toEqual({ date: "2026-11-16", status: "late" }); // Monday of this week
    expect(last[1].status).toBe("absent");
    expect(last[3]).toEqual({ date: "2026-11-19", status: null }); // future
  });
});

describe("appeal eligibility", () => {
  const base = { state: "ended", ends_at: "2026-11-18T02:45:00Z", status: "absent", appeal_days: 7, has_open_appeal: false };
  const now = new Date("2026-11-19T00:00:00Z");
  it("finished class with a bad status can be appealed within the period", () => {
    expect(appealOpen(base, now)).toEqual({ ok: true });
    expect(appealOpen({ ...base, state: "locked", status: "late" }, now)).toEqual({ ok: true });
  });
  it("not while running, not twice, not when present/excused, not after the period", () => {
    expect(appealOpen({ ...base, state: "live" }, now).ok).toBe(false);
    expect(appealOpen({ ...base, has_open_appeal: true }, now).ok).toBe(false);
    expect(appealOpen({ ...base, status: "present" }, now).ok).toBe(false);
    expect(appealOpen(base, new Date("2026-11-26T03:00:00Z")).ok).toBe(false);
  });
});
