/**
 * Live dashboard maths (pure, unit-tested). Time in class comes ONLY from door events:
 * recognised entry = in, recognised exit (way-out camera) = out. Faces are never recognised in the seats.
 */

export type DoorEvent = { type: "in" | "out"; student: string; at: number };
export type Segment = { from: number; to: number };
export type TimeInClass = { minutes: number; segments: Segment[]; inNow: boolean; lastOut: number | null };

/** Segments each student spent inside [start, end], from door events (plus a fallback entry time, e.g. self-verify). */
export function timeInClass(
  events: DoorEvent[],
  start: number,
  end: number,
  fallbackIn: Map<string, number> = new Map(),
): Map<string, TimeInClass> {
  const byStudent = new Map<string, DoorEvent[]>();
  for (const e of events) byStudent.set(e.student, [...(byStudent.get(e.student) ?? []), e]);
  for (const [s, at] of fallbackIn) {
    if (!byStudent.has(s)) byStudent.set(s, [{ type: "in", student: s, at }]);
  }
  const out = new Map<string, TimeInClass>();
  for (const [student, evs] of byStudent) {
    evs.sort((a, b) => a.at - b.at);
    const segments: Segment[] = [];
    let openAt: number | null = null;
    let lastOut: number | null = null;
    for (const e of evs) {
      const t = Math.min(Math.max(e.at, start), end);
      if (e.type === "in" && openAt === null) openAt = t;
      else if (e.type === "out") {
        lastOut = e.at;
        if (openAt !== null) {
          if (t > openAt) segments.push({ from: openAt, to: t });
          openAt = null;
        }
      }
    }
    const inNow = openAt !== null;
    if (openAt !== null && end > openAt) segments.push({ from: openAt, to: end });
    const minutes = Math.round(segments.reduce((sum, s) => sum + (s.to - s.from), 0) / 60_000);
    out.set(student, { minutes, segments, inNow, lastOut });
  }
  return out;
}

/** End of the window to show: the class end, or now while the class is still live. */
export function windowEnd(endsAt: string, live: boolean, now: number = Date.now()): number {
  const end = new Date(endsAt).getTime();
  return live ? Math.min(end, now) : end;
}

/** How many students the door events say were inside at time t (for the chart's "present" line). */
export function insideAt(times: Map<string, TimeInClass>, t: number): number {
  let n = 0;
  for (const v of times.values()) if (v.segments.some((s) => s.from <= t && t < s.to)) n++;
  return n;
}
