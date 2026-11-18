"use server";

import { z } from "zod";
import { check, formAction } from "@/lib/admin-action";
import { holidaySchema, semesterSchema } from "@/lib/validation";

export const createSemester = formAction({
  roles: ["admin"],
  schema: semesterSchema,
  revalidate: "/admin/semesters",
  run: async (input, { supabase }) => {
    check(await supabase.from("semesters").insert(input));
    return `Semester "${input.name}" created.`;
  },
});

export const addHoliday = formAction({
  roles: ["admin"],
  schema: holidaySchema,
  revalidate: "/admin/semesters",
  run: async (input, { supabase }) => {
    const { data: sem } = await supabase.from("semesters").select("starts_on, ends_on").eq("id", input.semester_id).single();
    if (sem && (input.day < sem.starts_on || input.day > sem.ends_on)) {
      return { ok: false, message: "That day is outside the semester." };
    }
    check(await supabase.from("holidays").insert(input));
    return `${input.kind === "exam" ? "Exam day" : "Holiday"} ${input.day} added. No sessions will be created that day.`;
  },
});

export const deleteHoliday = formAction({
  roles: ["admin"],
  schema: z.object({ id: z.guid() }),
  revalidate: "/admin/semesters",
  run: async ({ id }, { supabase }) => {
    check(await supabase.from("holidays").delete().eq("id", id));
    return "Removed.";
  },
});
