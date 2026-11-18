import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicEnv } from "@/lib/env";
import type { PersonInput } from "@/lib/validation";
import type { Role } from "@/lib/roles";

type Admin = ReturnType<typeof createAdminClient>;

/** One-time "set your password" link (recovery OTP), shown to the admin to hand over. No email needed. */
export async function setPasswordLink(admin: Admin, email: string): Promise<string> {
  const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email });
  if (error || !data.properties?.hashed_token) throw new Error(error?.message ?? "Could not create the link");
  const url = new URL("/auth/confirm", publicEnv().NEXT_PUBLIC_APP_URL);
  url.searchParams.set("token_hash", data.properties.hashed_token);
  url.searchParams.set("type", "recovery");
  url.searchParams.set("next", "/update-password");
  return url.toString();
}

/**
 * Creates the auth user. The role goes into app_metadata (only the service role can write it);
 * the DB trigger copies it into public.profiles. Returns the new id + a set-password link.
 */
export async function createPerson(input: PersonInput): Promise<{ id: string; link: string }> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: input.email,
    email_confirm: true,
    app_metadata: { role: input.role },
    user_metadata: { full_name: input.full_name, student_no: input.student_no },
  });
  if (error || !data.user) throw new Error(error?.message ?? "Could not create the user");
  const id = data.user.id;
  // Belt and braces: make sure the profile matches what the admin asked for.
  const { error: pErr } = await admin
    .from("profiles")
    .update({ role: input.role, full_name: input.full_name, department_id: input.department_id ?? null })
    .eq("id", id);
  if (pErr) throw new Error(pErr.message);
  return { id, link: await setPasswordLink(admin, input.email) };
}

/** Keeps JWT app_metadata (used by proxy.ts) in sync with profiles.role (used by RLS). */
export async function syncRoleClaim(userId: string, role: Role) {
  const { error } = await createAdminClient().auth.admin.updateUserById(userId, { app_metadata: { role } });
  if (error) throw new Error(error.message);
}

/** Deactivated users are also banned in Auth so they cannot sign in at all. */
export async function setAuthBan(userId: string, banned: boolean) {
  const { error } = await createAdminClient().auth.admin.updateUserById(userId, {
    ban_duration: banned ? "876000h" : "none",
  });
  if (error) throw new Error(error.message);
}
