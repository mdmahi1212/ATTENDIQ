"use server";

import { z } from "zod";
import { check, formAction } from "@/lib/admin-action";
import { findSlotConflicts } from "@/lib/schedule";
import { timetableSlotSchema } from "@/lib/validation";

export const createSlot = formAction({
  roles: ["admin"],
  schema: timetableSlotSchema,
  revalidate: ["/admin/timetable", "/admin/sections"],
  run: async (input, { supabase }) => {
    // The room must not host two sections at the same time.
    const { data: section } = await supabase.from("sections").select("room_id, semester_id").eq("id", input.section_id).single();
    const roomId = input.room_id ?? section?.room_id ?? null;
    if (roomId && section) {
      const { data: others } = await supabase
        .from("timetable_slots")
        .select("id, weekday, start_time, end_time, room_id, section_id, sections!inner(room_id, semester_id)")
        .eq("is_active", true)
        .eq("sections.semester_id", section.semester_id);
      const sameRoom = (others ?? []).filter((o) => (o.room_id ?? o.sections.room_id) === roomId);
      const clash = findSlotConflicts([{ ...input, id: "new" }], sameRoom);
      if (clash.length) return { ok: false, message: "That room is already booked at an overlapping time." };
    }
    check(await supabase.from("timetable_slots").insert(input));
    return "Timetable slot added. Sessions are generated each day by the minute tick.";
  },
});

export const toggleSlot = formAction({
  roles: ["admin"],
  schema: z.object({ id: z.guid(), is_active: z.enum(["true", "false"]) }),
  revalidate: "/admin/timetable",
  run: async ({ id, is_active }, { supabase }) => {
    check(await supabase.from("timetable_slots").update({ is_active: is_active === "true" }).eq("id", id));
    return is_active === "true" ? "Slot enabled." : "Slot paused.";
  },
});

export const deleteSlot = formAction({
  roles: ["admin"],
  schema: z.object({ id: z.guid() }),
  revalidate: "/admin/timetable",
  run: async ({ id }, { supabase }) => {
    check(await supabase.from("timetable_slots").delete().eq("id", id));
    return "Slot deleted (existing sessions keep their history).";
  },
});
