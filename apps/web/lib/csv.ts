import Papa from "papaparse";
import { csvPersonSchema } from "@/lib/validation";
import type { z } from "zod";

export type CsvPerson = z.infer<typeof csvPersonSchema>;
export type CsvPreviewRow =
  | { line: number; ok: true; value: CsvPerson }
  | { line: number; ok: false; raw: Record<string, string>; errors: string[] };

export const CSV_HEADER = ["email", "full_name", "role", "student_no"] as const;

/** Parse + validate a people CSV for the import preview. Duplicate emails are flagged. */
export function parsePeopleCsv(text: string): { rows: CsvPreviewRow[]; headerErrors: string[] } {
  const parsed = Papa.parse<Record<string, string>>(text.trim(), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim().toLowerCase(),
  });
  const fields = parsed.meta.fields ?? [];
  const headerErrors = ["email", "full_name"]
    .filter((f) => !fields.includes(f))
    .map((f) => `Missing column "${f}"`);
  if (headerErrors.length) return { rows: [], headerErrors };

  const seen = new Set<string>();
  const rows = parsed.data.map((raw, i): CsvPreviewRow => {
    const line = i + 2; // header is line 1
    const result = csvPersonSchema.safeParse(raw);
    if (!result.success) {
      return {
        line,
        ok: false,
        raw,
        errors: result.error.issues.map((iss) => `${iss.path.join(".") || "row"}: ${iss.message}`),
      };
    }
    if (seen.has(result.data.email)) {
      return { line, ok: false, raw, errors: [`email: duplicate in file (${result.data.email})`] };
    }
    seen.add(result.data.email);
    return { line, ok: true, value: result.data };
  });
  return { rows, headerErrors };
}

/** RFC 4180-safe CSV for exports. */
export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  return Papa.unparse({ fields: columns, data: rows.map((r) => columns.map((c) => r[c] ?? "")) });
}
