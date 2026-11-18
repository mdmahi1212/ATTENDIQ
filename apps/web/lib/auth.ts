import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { mfaEnforced, mfaSatisfied } from "@/lib/mfa";
import type { Role } from "@/lib/roles";

export type CurrentUser = {
  id: string;
  email: string | null;
  fullName: string;
  role: Role;
  /** false = admin/operator signed in with password only while MFA is enforced (must pass /account/security). */
  mfaOk: boolean;
};

/**
 * Data Access Layer: the signed-in user's AUTHORITATIVE role from public.profiles
 * (the JWT app_metadata role is only used by proxy.ts for fast redirects).
 * Deduplicated per request with React cache().
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, is_active")
    .eq("id", userId)
    .maybeSingle();
  if (!profile || !profile.is_active) return null;
  const aal = typeof data?.claims?.aal === "string" ? data.claims.aal : undefined;
  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    role: profile.role,
    mfaOk: mfaSatisfied(profile.role, aal, mfaEnforced()),
  };
});

/** Use at the top of every portal layout, page loader, Server Action and Route Handler. */
export async function requireRole(...roles: Role[]): Promise<CurrentUser> {
  const user = await requireRoleBeforeMfa(...roles);
  if (!user.mfaOk) redirect("/account/security?mfa=required");
  return user;
}

/** Same role check without the MFA step: only for the page where the second factor is set up / entered. */
export async function requireRoleBeforeMfa(...roles: Role[]): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!roles.includes(user.role)) redirect("/forbidden");
  return user;
}

/** For Server Actions that must return an error object instead of redirecting. */
export async function assertRole(...roles: Role[]): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user || !roles.includes(user.role)) {
    throw new Error("Not allowed");
  }
  if (!user.mfaOk) throw new Error("Two-factor authentication required");
  return user;
}
