import { describe, expect, it } from "vitest";
import { parsePeopleCsv, toCsv } from "@/lib/csv";

describe("people CSV import preview", () => {
  it("validates rows, defaults role, flags duplicates and bad rows", () => {
    const csv = [
      "Email,Full_Name,Role,Student_No",
      "a@uni.ac.kr,Alice Kim,,S001",
      "B@UNI.AC.KR,Bob Lee,professor,",
      "not-an-email,Carol,,",
      "a@uni.ac.kr,Alice Again,,S009",
      "d@uni.ac.kr,Dan,janitor,",
    ].join("\n");
    const { rows, headerErrors } = parsePeopleCsv(csv);
    expect(headerErrors).toEqual([]);
    expect(rows).toHaveLength(5);
    expect(rows[0]).toMatchObject({ line: 2, ok: true, value: { email: "a@uni.ac.kr", role: "student", student_no: "S001" } });
    expect(rows[1]).toMatchObject({ ok: true, value: { email: "b@uni.ac.kr", role: "professor" } });
    expect(rows[2].ok).toBe(false);
    expect(rows[3]).toMatchObject({ ok: false });
    expect(!rows[3].ok && rows[3].errors[0]).toMatch(/duplicate/);
    expect(rows[4].ok).toBe(false);
  });

  it("reports missing required columns", () => {
    expect(parsePeopleCsv("name,email\nx,y@z.co").headerErrors).toEqual(['Missing column "full_name"']);
  });

  it("export escapes commas and quotes", () => {
    const out = toCsv([{ a: 'He said "hi"', b: "x,y" }], ["a", "b"]);
    expect(out.split(/\r?\n/)[1]).toBe('"He said ""hi""","x,y"');
  });
});
