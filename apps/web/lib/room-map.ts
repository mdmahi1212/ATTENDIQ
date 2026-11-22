export type RoomPerson = { x: number; y: number; student_id?: string };

/** People from the room camera's latest count (positions 0..1, feet point); invalid entries dropped. */
export function parsePeople(payload: unknown): RoomPerson[] {
  const list = (payload as { people?: unknown } | null)?.people;
  if (!Array.isArray(list)) return [];
  return list
    .filter((p): p is RoomPerson => {
      const q = p as RoomPerson;
      return typeof q?.x === "number" && typeof q?.y === "number" && q.x >= 0 && q.x <= 1 && q.y >= 0 && q.y <= 1;
    })
    .slice(0, 60)
    .map((p) => ({ x: p.x, y: p.y, ...(typeof p.student_id === "string" ? { student_id: p.student_id } : {}) }));
}
