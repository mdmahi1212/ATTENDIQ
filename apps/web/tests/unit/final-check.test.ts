import { describe, expect, it } from "vitest";
import { endStep, parseFinalCheck } from "@/lib/final-check";

describe("final room check", () => {
  const now = Date.parse("2026-11-24T10:00:00Z");
  const ago = (s: number) => new Date(now - s * 1000).toISOString();

  it("End session: check first, wait while it runs, then close", () => {
    expect(endStep(null, null, now)).toBe("check");
    expect(endStep(ago(20), null, now)).toBe("waiting");
    expect(endStep(ago(20), ago(60), now)).toBe("waiting"); // an older result does not count
    expect(endStep(ago(60), ago(10), now)).toBe("close");
    expect(endStep(ago(200), null, now)).toBe("check"); // the edge never answered: ask again
    expect(endStep(ago(900), ago(800), now)).toBe("check"); // result too old (> 5 min)
  });

  it("reads the stored result safely", () => {
    const r = parseFinalCheck({ people_in_room: 4, marked_present: 6, not_seen: ["Nahid", 3, "jidan"], frames: 150 });
    expect(r).toMatchObject({ people_in_room: 4, marked_present: 6, not_seen: ["Nahid", "jidan"], in_room_not_marked: [], frames: 150 });
    expect(parseFinalCheck(null)).toBeNull();
    expect(parseFinalCheck([1])).toBeNull();
  });
});
