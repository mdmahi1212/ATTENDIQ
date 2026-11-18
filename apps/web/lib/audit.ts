import type { Json } from "@/lib/database.types";

const IGNORED = new Set(["updated_at"]);

const show = (v: unknown) => (v === undefined ? "∅" : v === null ? "null" : typeof v === "object" ? JSON.stringify(v) : String(v));

/** Field-level diff between the audit row's before/after snapshots (inserts and deletes included). */
export function changedKeys(before: Json | null, after: Json | null): { key: string; from: string; to: string }[] {
  const b = (before && typeof before === "object" && !Array.isArray(before) ? before : {}) as Record<string, unknown>;
  const a = (after && typeof after === "object" && !Array.isArray(after) ? after : {}) as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])].filter((k) => !IGNORED.has(k)).sort();
  return keys
    .filter((k) => JSON.stringify(b[k]) !== JSON.stringify(a[k]))
    .map((k) => ({ key: k, from: show(b[k]), to: show(a[k]) }));
}
