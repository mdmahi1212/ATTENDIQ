export type Slot = { id: string; weekday: number; start_time: string; end_time: string };

const minutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

/** Two slots overlap if they share a weekday and their [start, end) ranges intersect. */
export function slotsOverlap(a: Slot, b: Slot): boolean {
  return a.weekday === b.weekday && minutes(a.start_time) < minutes(b.end_time) && minutes(b.start_time) < minutes(a.end_time);
}

/** Pairs (a from `mine`, b from `others`) that overlap; a slot never conflicts with itself. */
export function findSlotConflicts(mine: Slot[], others: Slot[]): [Slot, Slot][] {
  const out: [Slot, Slot][] = [];
  for (const a of mine) for (const b of others) if (a.id !== b.id && slotsOverlap(a, b)) out.push([a, b]);
  return out;
}
