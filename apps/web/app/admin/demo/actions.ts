"use server";

import { z } from "zod";
import { check, formAction } from "@/lib/admin-action";
import type { Json } from "@/lib/database.types";
import { DEMO_LENGTHS, fullClassMinutes, withDemoPolicy } from "@/lib/demo";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Starts a real (non-simulated) demo class for a section NOW in its room. Short lengths (5 / 10 / 15 min) run the
 * rules on a shortened clock (lib/demo.ts); "full" is a normal-length class with the normal rules.
 * The class ends and is finalized by session_tick like any other class.
 */
export const startDemoClass = formAction({
  roles: ["admin"],
  schema: z.object({
    id: z.guid(),
    length: z.union([z.literal("full"), z.coerce.number().int().refine((n) => (DEMO_LENGTHS as readonly number[]).includes(n))]),
  }),
  revalidate: ["/admin/demo", "/admin"],
  run: async ({ id, length }, { supabase }) => {
    const { data: section } = check(
      await supabase.from("sections").select("room_id, timetable_slots(start_time, end_time)").eq("id", id).single(),
    );
    if (!section?.room_id) return { ok: false, message: "Give the section a room first." };
    const full = length === "full";
    const minutes = full ? fullClassMinutes(section.timetable_slots) : Number(length);
    const admin = createAdminClient();
    const { data: sessionId } = check(
      await admin.rpc("create_adhoc_session", {
        p_room: section.room_id,
        p_section: id,
        p_starts_at: new Date().toISOString(),
        p_minutes: minutes,
        p_simulation: false,
      }),
    );
    if (!full) {
      const { data: s } = check(await admin.from("class_sessions").select("policy").eq("id", String(sessionId)).single());
      check(
        await admin.from("class_sessions").update({ policy: withDemoPolicy(s?.policy, minutes) as Json }).eq("id", String(sessionId)),
      );
    }
    return `${full ? "Full" : `${minutes}-minute demo`} class started (${minutes} min). Cameras and the laptop pick it up within seconds.`;
  },
});
