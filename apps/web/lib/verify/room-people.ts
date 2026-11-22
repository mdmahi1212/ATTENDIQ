import "server-only";
import { parsePeople, type RoomPerson } from "@/lib/room-map";
import type { createAdminClient } from "@/lib/supabase/admin";
import { SEAT_MAX_AGE_S } from "@/lib/verify/seat";

/** The room camera's latest people positions for a class, or null when none is recent enough. */
export async function latestRoomPeople(admin: ReturnType<typeof createAdminClient>, sessionId: string, nowMs: number): Promise<RoomPerson[] | null> {
  const { data } = await admin
    .from("edge_events")
    .select("payload, observed_at")
    .eq("session_id", sessionId)
    .eq("event_type", "OCCUPANCY_UPDATED")
    .order("observed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data || nowMs - Date.parse(data.observed_at) > SEAT_MAX_AGE_S * 1000) return null;
  return parsePeople(data.payload);
}
