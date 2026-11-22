"use server";

import { z } from "zod";
import { check, formAction } from "@/lib/admin-action";
import { DEMO_LENGTHS } from "@/lib/demo";
import { startDemoClass as start } from "@/lib/demo-class";
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
    const { data: section } = check(await supabase.from("sections").select("room_id").eq("id", id).single());
    if (!section?.room_id) return { ok: false, message: "Give the section a room first." };
    const { minutes } = await start(createAdminClient(), { sectionId: id, roomId: section.room_id, length });
    return `${length === "full" ? "Full" : `${minutes}-minute demo`} class started (${minutes} min). Cameras and the laptop pick it up within seconds.`;
  },
});
