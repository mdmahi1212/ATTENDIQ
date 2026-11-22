/**
 * #5 Class summary for the professor: plain facts about one ended class, a template text from them (always works),
 * and a short written version by Claude when ANTHROPIC_API_KEY is set on the server.
 * Only names, statuses and counts go to Claude - no faces, photos, GPS or student numbers.
 */

export type SummaryStudent = { name: string; status: string; flags: string[]; note: string | null; minutesLate: number | null };

export type ClassFacts = {
  course: string; // "IOT401-01 Internet of Things"
  date: string; // "2026-11-23 10:00-10:10"
  students: SummaryStudent[];
  unknownEntries: number;
  atRisk: { name: string; pct: number }[]; // this section, last 30 days, under 85 %
};

export function counts(f: ClassFacts) {
  const by = (s: string) => f.students.filter((x) => x.status === s).length;
  return { total: f.students.length, present: by("present"), late: by("late"), absent: by("absent"), excused: by("excused") };
}

const list = (xs: string[]) => (xs.length ? xs.join(", ") : "none");

/** Plain summary from the facts (no AI). Also what Claude is given to work from. */
export function templateSummary(f: ClassFacts): string {
  const c = counts(f);
  const attended = c.present + c.late;
  const lines = [
    `${f.course}, ${f.date}: ${attended} of ${c.total} attended (${c.present} present, ${c.late} late, ${c.absent} absent${c.excused ? `, ${c.excused} excused` : ""}).`,
  ];
  const late = f.students.filter((s) => s.status === "late");
  if (late.length) lines.push(`Late: ${list(late.map((s) => (s.minutesLate != null ? `${s.name} (${s.minutesLate} min)` : s.name)))}.`);
  const left = f.students.filter((s) => s.flags.includes("left_no_return"));
  if (left.length) lines.push(`Left and did not come back: ${list(left.map((s) => s.name))}.`);
  const unconf = f.students.filter((s) => s.flags.includes("unconfirmed"));
  if (unconf.length) lines.push(`Marked but never seen in the room (please review): ${list(unconf.map((s) => s.name))}.`);
  const review = f.students.filter((s) => s.flags.includes("needs_review"));
  if (review.length) lines.push(`Need review (a camera had a problem): ${list(review.map((s) => s.name))}.`);
  if (f.unknownEntries) lines.push(`${f.unknownEntries} unknown or refused entr${f.unknownEntries === 1 ? "y" : "ies"} at the door.`);
  if (f.atRisk.length) lines.push(`Attendance below 85% in the last 30 days: ${list(f.atRisk.map((r) => `${r.name} ${r.pct}%`))}.`);
  return lines.join("\n");
}

export const SUMMARY_SYSTEM = [
  "You write short attendance summaries for a university professor after a class.",
  "Use only the facts given. Do not invent reasons, names or numbers.",
  "Write 3 to 6 short sentences in plain English, then up to 3 bullet points of suggested follow-ups",
  "(for example: review the students marked but not seen in the room, talk to students under 75%).",
  "No headings, no greetings, no closing line.",
].join(" ");

export function summaryPrompt(f: ClassFacts): string {
  return `Facts about the class (JSON):\n${JSON.stringify(f)}\n\nPlain version for reference:\n${templateSummary(f)}`;
}
