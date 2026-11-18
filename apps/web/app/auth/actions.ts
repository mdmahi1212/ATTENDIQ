"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { fromZodError, formToObject, type ActionState } from "@/lib/action-state";
import { publicEnv } from "@/lib/env";
import { homeForRole, isRole } from "@/lib/roles";

const credentials = z.object({ email: z.email(), password: z.string().min(8, "At least 8 characters") });

/** Only allow same-site relative paths as post-login targets (no open redirects). */
function safeNext(next: string | undefined): string | null {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : null;
}

export async function signIn(_prev: ActionState, form: FormData): Promise<ActionState> {
  const raw = formToObject(form);
  const parsed = credentials.safeParse(raw);
  if (!parsed.success) return fromZodError(parsed.error);
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) return { ok: false, message: "Wrong email or password." };
  const role = data.user.app_metadata?.role;
  redirect(safeNext(raw.next) ?? homeForRole(isRole(role) ? role : "student"));
}

const signUpSchema = credentials.extend({
  full_name: z.string().trim().min(2).max(120),
  student_no: z.string().trim().max(30).optional(),
});

export async function signUp(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = signUpSchema.safeParse(formToObject(form));
  if (!parsed.success) return fromZodError(parsed.error);
  const { email, password, full_name, student_no } = parsed.data;
  const supabase = await createClient();
  // Role is NOT taken from user metadata: the DB trigger makes every self sign-up a student.
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name, student_no },
      emailRedirectTo: `${publicEnv().NEXT_PUBLIC_APP_URL}/auth/confirm?next=/student`,
    },
  });
  if (error) return { ok: false, message: error.message };
  if (data.session) redirect("/student");
  return { ok: true, message: "Check your email to confirm your account, then sign in." };
}

export async function requestPasswordReset(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = z.object({ email: z.email() }).safeParse(formToObject(form));
  if (!parsed.success) return fromZodError(parsed.error);
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${publicEnv().NEXT_PUBLIC_APP_URL}/auth/confirm?next=/update-password`,
  });
  // Same answer whether or not the account exists (no account enumeration).
  return { ok: true, message: "If that email has an account, a reset link is on its way." };
}

export async function updatePassword(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = z
    .object({ password: z.string().min(8, "At least 8 characters"), confirm: z.string() })
    .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords do not match" })
    .safeParse(formToObject(form));
  if (!parsed.success) return fromZodError(parsed.error);
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return { ok: false, message: "Your reset link expired. Request a new one." };
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { ok: false, message: error.message };
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
