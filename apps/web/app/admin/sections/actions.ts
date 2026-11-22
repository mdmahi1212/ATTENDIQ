"use server";

import { z } from "zod";
import { check, formAction } from "@/lib/admin-action";
import { DEMO_MINUTES, withDemoPolicy } from "@/lib/demo";
import type { Json } from "@/lib/database.types";
import { createAdminClient } from "@/lib/supabase/admin";
import { sectionSchema, sectionStaffSchema } from "@/lib/validation";

export const createSection = formAction({
  roles: ["admin"],
  schema: sectionSchema,
  revalidate: "/admin/sections",
  run: async (input, { supabase }) => {
    check(await supabase.from("sections").insert(input));
    return `Section ${input.section_no} created.`;
  },
});

export const updateSectionRoom = formAction({
  roles: ["admin"],
  schema: z.object({ id: z.guid(), room_id: z.preprocess((v) => v || null, z.guid().nullable()) }),
  revalidate: ["/admin/sections"],
  run: async ({ id, room_id }, { supabase }) => {
    check(await supabase.from("sections").update({ room_id }).eq("id", id));
    return "Room updated.";
  },
});

export const deleteSection = formAction({
  roles: ["admin"],
  schema: z.object({ id: z.guid() }),
  revalidate: "/admin/sections",
  run: async ({ id }, { supabase }) => {
    const { count } = await supabase.from("class_sessions").select("*", { count: "exact", head: true }).eq("section_id", id);
    if (count) return { ok: false, message: "This section already has sessions; keep it for the attendance history." };
    check(await supabase.from("sections").delete().eq("id", id));
    return "Section deleted.";
  },
});

export const assignStaff = formAction({
  roles: ["admin"],
  schema: sectionStaffSchema,
  revalidate: "/admin/sections",
  run: async (input, { supabase }) => {
    const { data: person } = await supabase.from("profiles").select("role").eq("id", input.profile_id).single();
    if (!person || !["professor", "admin"].includes(person.role)) {
      return { ok: false, message: "Only professors can be assigned as section staff." };
    }
    check(await supabase.from("section_staff").upsert(input));
    return "Staff assigned.";
  },
});

export const removeStaff = formAction({
  roles: ["admin"],
  schema: z.object({ section_id: z.guid(), profile_id: z.guid() }),
  revalidate: "/admin/sections",
  run: async ({ section_id, profile_id }, { supabase }) => {
    check(await supabase.from("section_staff").delete().eq("section_id", section_id).eq("profile_id", profile_id));
    return "Removed from section.";
  },
});

/**
 * Starts a real (non-simulated) ad-hoc session for this section NOW in its room, for live tests of the
 * gate camera outside the timetable. It ends and is finalized by session_tick after `minutes`.
 */
export const startTestSession = formAction({
  roles: ["admin"],
  schema: z.object({
    id: z.guid(),
    minutes: z.coerce.number().int().min(10).max(240).default(30),
    // Demo: start the class N minutes in the past so a walk-in now counts as late (demo script step 6).
    started_minutes_ago: z.coerce.number().int().min(0).max(60).default(0),
    // Recorded-video demo class: 10 minutes with the shortened demo rules (lib/demo.ts).
    demo: z.enum(["0", "1"]).default("0"),
  }),
  revalidate: "/admin/sections",
  run: async ({ id, minutes, started_minutes_ago, demo }, { supabase }) => {
    const { data: section } = check(await supabase.from("sections").select("room_id").eq("id", id).single());
    if (!section?.room_id) return { ok: false, message: "Give the section a room first." };
    const admin = createAdminClient();
    if (demo === "1") {
      minutes = DEMO_MINUTES;
      started_minutes_ago = 0;
    }
    const { data: sessionId } = check(
      await admin.rpc("create_adhoc_session", {
        p_room: section.room_id,
        p_section: id,
        p_starts_at: new Date(Date.now() - started_minutes_ago * 60_000).toISOString(),
        p_minutes: minutes,
        p_simulation: false,
      }),
    );
    if (demo === "1") {
      const { data: s } = check(await admin.from("class_sessions").select("policy").eq("id", String(sessionId)).single());
      check(await admin.from("class_sessions").update({ policy: withDemoPolicy(s?.policy) as Json }).eq("id", String(sessionId)));
      return `Video demo class started (${DEMO_MINUTES} min, demo timing: present 2 min, late until 8, professor alert at 7). Run scripts/run-video-demo.ps1 on the laptop now (id ${String(sessionId).slice(0, 8)}…).`;
    }
    return `Test session started ${started_minutes_ago ? `${started_minutes_ago} min ago` : "now"} for ${minutes} min (id ${String(sessionId).slice(0, 8)}…). Enrolled students are 'pending' until the gate camera sees them.`;
  },
});
