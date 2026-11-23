export type FinalCheckResult = {
  people_in_room: number;
  people_max: number;
  marked_present: number;
  recognised: number;
  not_seen: string[];
  in_room_not_marked: string[];
  unknown_faces: number;
  window_s: number;
  frames: number;
};

/** A final room check this recent lets "End session" close the class straight away. */
export const FINAL_CHECK_FRESH_MS = 5 * 60_000;

export function parseFinalCheck(v: unknown): FinalCheckResult | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const num = (k: string) => (typeof o[k] === "number" ? (o[k] as number) : 0);
  const names = (k: string) => (Array.isArray(o[k]) ? (o[k] as unknown[]).filter((x): x is string => typeof x === "string") : []);
  return {
    people_in_room: num("people_in_room"), people_max: num("people_max"), marked_present: num("marked_present"),
    recognised: num("recognised"), not_seen: names("not_seen"), in_room_not_marked: names("in_room_not_marked"),
    unknown_faces: num("unknown_faces"), window_s: num("window_s"), frames: num("frames"),
  };
}

/** What "End session" should do now: start a room check, wait for it, or close the class. */
export function endStep(requestedAt: string | null, checkAt: string | null, nowMs: number): "check" | "waiting" | "close" {
  const answered = checkAt !== null && (!requestedAt || Date.parse(checkAt) >= Date.parse(requestedAt));
  if (answered && nowMs - Date.parse(checkAt!) <= FINAL_CHECK_FRESH_MS) return "close";
  if (requestedAt && nowMs - Date.parse(requestedAt) <= 90_000 && (!checkAt || Date.parse(checkAt) < Date.parse(requestedAt))) return "waiting";
  return "check";
}
