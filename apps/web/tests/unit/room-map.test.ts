import { describe, expect, it } from "vitest";
import { parsePeople } from "@/lib/room-map";

describe("room map", () => {
  it("keeps valid positions and student ids only", () => {
    const p = parsePeople({ raw: 3, people: [{ x: 0.2, y: 0.8, student_id: "s1" }, { x: 2, y: 0.5 }, { x: 0.5, y: 0.5, student_id: 7 }, "x"] });
    expect(p).toEqual([{ x: 0.2, y: 0.8, student_id: "s1" }, { x: 0.5, y: 0.5 }]);
  });
  it("handles old counts without positions", () => {
    expect(parsePeople({ raw: 3 })).toEqual([]);
    expect(parsePeople(null)).toEqual([]);
  });
});
