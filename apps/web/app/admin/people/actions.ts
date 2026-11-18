"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertRole } from "@/lib/auth";
import { check, formAction } from "@/lib/admin-action";
import { errorMessage } from "@/lib/action-state";
import { createPerson, setAuthBan, setPasswordLink, syncRoleClaim } from "@/lib/people";
import { createAdminClient } from "@/lib/supabase/admin";
import { ASSIGNABLE_ROLES, csvPersonSchema, personSchema } from "@/lib/validation";

export const createPersonAction = formAction({
  roles: ["admin"],
  schema: personSchema,
  revalidate: "/admin/people",
  run: async (input) => {
    const { link } = await createPerson(input);
    return { ok: true, message: `${input.full_name} created.`, data: { link, email: input.email } };
  },
});

export const changeRole = formAction({
  roles: ["admin"],
  schema: z.object({ id: z.guid(), role: z.enum(ASSIGNABLE_ROLES) }),
  revalidate: "/admin/people",
  run: async ({ id, role }, { supabase, user }) => {
    if (id === user.id && role !== "admin") return { ok: false, message: "You cannot remove your own admin role." };
    check(await supabase.from("profiles").update({ role }).eq("id", id)); // audited by trigger
    await syncRoleClaim(id, role);
    return `Role changed to ${role}. It applies at the user's next sign-in or token refresh.`;
  },
});

export const setActive = formAction({
  roles: ["admin"],
  schema: z.object({ id: z.guid(), active: z.enum(["true", "false"]) }),
  revalidate: "/admin/people",
  run: async ({ id, active }, { supabase, user }) => {
    if (id === user.id) return { ok: false, message: "You cannot deactivate yourself." };
    const isActive = active === "true";
    check(await supabase.from("profiles").update({ is_active: isActive }).eq("id", id));
    await setAuthBan(id, !isActive);
    return isActive ? "Account re-activated." : "Account deactivated (sign-in blocked, history kept).";
  },
});

export const passwordLink = formAction({
  roles: ["admin"],
  schema: z.object({ email: z.email() }),
  revalidate: "/admin/people",
  run: async ({ email }) => {
    const link = await setPasswordLink(createAdminClient(), email);
    return { ok: true, message: "One-time link created.", data: { link, email } };
  },
});

export type ImportResult = { email: string; ok: boolean; message: string; link?: string };

/** Bulk import from the CSV preview. Rows are re-validated here: the browser is never trusted. */
export async function importPeople(rows: unknown): Promise<{ ok: boolean; message: string; results: ImportResult[] }> {
  try {
    await assertRole("admin");
  } catch {
    return { ok: false, message: "You are not allowed to do that.", results: [] };
  }
  const parsed = z.array(csvPersonSchema).max(500).safeParse(rows);
  if (!parsed.success) return { ok: false, message: "Invalid rows; re-check the preview.", results: [] };
  const results: ImportResult[] = [];
  for (const row of parsed.data) {
    try {
      const { link } = await createPerson(row);
      results.push({ email: row.email, ok: true, message: "created", link });
    } catch (e) {
      results.push({ email: row.email, ok: false, message: errorMessage(e) });
    }
  }
  revalidatePath("/admin/people");
  const created = results.filter((r) => r.ok).length;
  return { ok: created > 0, message: `${created} of ${results.length} created.`, results };
}
