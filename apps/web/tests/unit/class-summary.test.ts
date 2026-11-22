import { describe, expect, it } from "vitest";
import { counts, summaryPrompt, templateSummary, type ClassFacts } from "@/lib/class-summary";

const facts: ClassFacts = {
  course: "IOT401-01 Internet of Things",
  date: "2026-11-23 10:00-10:10",
  students: [
    { name: "Mahi Imran", status: "present", flags: [], note: null, minutesLate: null },
    { name: "fahim", status: "late", flags: ["unconfirmed"], note: "marked at the door but not seen in the room", minutesLate: 4 },
    { name: "Ana Kim", status: "absent", flags: ["left_no_return"], note: "left at 10:06", minutesLate: null },
  ],
  unknownEntries: 1,
  atRisk: [{ name: "Ana Kim", pct: 60 }],
};

describe("class summary", () => {
  it("counts statuses", () => {
    expect(counts(facts)).toEqual({ total: 3, present: 1, late: 1, absent: 1, excused: 0 });
  });

  it("writes a plain summary with every follow-up", () => {
    const t = templateSummary(facts);
    expect(t).toContain("2 of 3 attended (1 present, 1 late, 1 absent)");
    expect(t).toContain("Late: fahim (4 min)");
    expect(t).toContain("Left and did not come back: Ana Kim");
    expect(t).toContain("never seen in the room (please review): fahim");
    expect(t).toContain("1 unknown or refused entry");
    expect(t).toContain("Ana Kim 60%");
  });

  it("sends Claude only names, statuses and counts", () => {
    const p = summaryPrompt(facts);
    expect(p).toContain("\"name\":\"fahim\"");
    expect(p).not.toMatch(/"student_no"|"embedding"|"lat"|"lng"/); // no ids, faces or GPS keys
  });
});
