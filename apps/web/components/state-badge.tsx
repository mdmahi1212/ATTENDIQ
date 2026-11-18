import { Pill } from "@/components/badges";
import type { Database } from "@/lib/database.types";

type SessionState = Database["public"]["Enums"]["session_state"];

const TONE: Record<SessionState, "gray" | "green" | "amber" | "red" | "blue"> = {
  scheduled: "gray",
  live: "green",
  recheck: "amber",
  ended: "blue",
  locked: "gray",
  cancelled: "red",
};

export function StateBadge({ state }: { state: SessionState }) {
  return <Pill tone={TONE[state]}>{state}</Pill>;
}
