"use server";

import { z } from "zod";
import { check, formAction } from "@/lib/admin-action";
import { departmentSchema } from "@/lib/validation";

export const createDepartment = formAction({
  roles: ["admin"],
  schema: departmentSchema,
  revalidate: "/admin/departments",
  run: async (input, { supabase }) => {
    check(await supabase.from("departments").insert(input));
    return `Department "${input.name}" created.`;
  },
});

export const deleteDepartment = formAction({
  roles: ["admin"],
  schema: z.object({ id: z.guid() }),
  revalidate: "/admin/departments",
  run: async ({ id }, { supabase }) => {
    check(await supabase.from("departments").delete().eq("id", id));
    return "Department deleted.";
  },
});
