import type { Database } from "@/lib/database.types";

export type AttStatus = Database["public"]["Enums"]["att_status"];
export type FaceStatus = "pending" | "active" | "review" | "rejected" | "deleted";

/** Fixed colours from the build prompt. Literal class strings so Tailwind keeps them. */
export const ATT_STATUS_CLASS: Record<AttStatus, string> = {
  present: "bg-green-100 text-green-800 border-green-300",
  late: "bg-amber-100 text-amber-900 border-amber-300",
  absent: "bg-red-100 text-red-800 border-red-300",
  left_early: "bg-orange-100 text-orange-900 border-orange-300",
  excused: "bg-blue-100 text-blue-800 border-blue-300",
  pending: "bg-gray-100 text-gray-700 border-gray-300",
};

export const ATT_STATUS_LABEL: Record<AttStatus, string> = {
  present: "Present",
  late: "Late",
  absent: "Absent",
  left_early: "Left early",
  excused: "Excused",
  pending: "Pending",
};

export const SIM_CLASS = "bg-purple-100 text-purple-800 border-purple-300";

export const FACE_STATUS_CLASS: Record<FaceStatus, string> = {
  active: "bg-green-100 text-green-800 border-green-300",
  pending: "bg-gray-100 text-gray-700 border-gray-300",
  review: "bg-amber-100 text-amber-900 border-amber-300",
  rejected: "bg-red-100 text-red-800 border-red-300",
  deleted: "bg-slate-200 text-slate-700 border-slate-300",
};

/** Device health from heartbeat age: online < 30 s (spec: "offline within 30 s"), stale < 120 s. */
export function deviceHealth(ageSec: number | null): "online" | "stale" | "offline" {
  if (ageSec === null) return "offline";
  if (ageSec < 30) return "online";
  if (ageSec < 120) return "stale";
  return "offline";
}
