import type { Role } from "@/lib/roles";

/** Roles that must use two-factor authentication (TOTP) when enforcement is on. */
export const MFA_ROLES: readonly Role[] = ["admin", "operator"];

/** ENFORCE_MFA=true (production) makes admin/operator sessions need aal2; off for local dev + e2e. */
export function mfaEnforced(env: string | undefined = process.env.ENFORCE_MFA): boolean {
  return env?.trim().toLowerCase() === "true";
}

/** True when this signed-in session may use the role's portal. aal = JWT `aal` claim ("aal1" | "aal2"). */
export function mfaSatisfied(role: Role, aal: string | undefined, enforce: boolean): boolean {
  if (!enforce || !MFA_ROLES.includes(role)) return true;
  return aal === "aal2";
}
