"use server";

import { z } from "zod";
import { check, formAction } from "@/lib/admin-action";
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
