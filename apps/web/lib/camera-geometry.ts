import type { Json } from "@/lib/database.types";

export type Pt = [number, number];

/** Parse a stored [[x,y],…] array of normalised points; invalid input -> []. */
export function parsePoints(v: Json | null): Pt[] {
  if (!Array.isArray(v)) return [];
  return v.filter(
    (p): p is [number, number] =>
      Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === "number" && n >= 0 && n <= 1),
  );
}

/** Pixel click inside a box -> normalised point (clamped, 4 decimals). */
export function normalise(x: number, y: number, width: number, height: number): Pt {
  const c = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 10_000) / 10_000;
  return [c(x / width), c(y / height)];
}
