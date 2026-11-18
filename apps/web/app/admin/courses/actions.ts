"use server";

import { z } from "zod";
import { check, formAction } from "@/lib/admin-action";
import { courseSchema } from "@/lib/validation";

export const createCourse = formAction({
  roles: ["admin"],
  schema: courseSchema,
  revalidate: "/admin/courses",
  run: async (input, { supabase }) => {
    check(await supabase.from("courses").insert(input));
    return `Course ${input.code} created.`;
  },
});

export const deleteCourse = formAction({
  roles: ["admin"],
  schema: z.object({ id: z.guid() }),
  revalidate: "/admin/courses",
  run: async ({ id }, { supabase }) => {
    const { count } = await supabase.from("sections").select("*", { count: "exact", head: true }).eq("course_id", id);
    if (count) return { ok: false, message: "Delete its sections first (attendance history would be lost)." };
    check(await supabase.from("courses").delete().eq("id", id));
    return "Course deleted.";
  },
});
