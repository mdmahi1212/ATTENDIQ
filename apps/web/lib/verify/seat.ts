import type { RoomPerson } from "@/lib/room-map";

/** How close (0..1 of the room picture) a tap must be to a person the room camera sees. */
export const SEAT_RADIUS = 0.08;
/** The room camera's people list must be this fresh to prove a seat (it is sent every ~10 s). */
export const SEAT_MAX_AGE_S = 90;

/**
 * Seat proof for self-verify: the student taps where they sit; it counts only if the room camera sees a person
 * right there who is not already known to be someone else. A friend at home cannot pass: no body in that seat.
 */
export function seatMatches(people: RoomPerson[], seat: { x: number; y: number }, studentId: string): boolean {
  return people.some(
    (p) => Math.hypot(p.x - seat.x, p.y - seat.y) <= SEAT_RADIUS && (!p.student_id || p.student_id === studentId),
  );
}

/** Dots for the student's seat picker: positions only, and whether the dot is already someone else. */
export function seatDots(people: RoomPerson[], studentId: string): { x: number; y: number; taken: boolean }[] {
  return people.map((p) => ({ x: p.x, y: p.y, taken: Boolean(p.student_id && p.student_id !== studentId) }));
}
