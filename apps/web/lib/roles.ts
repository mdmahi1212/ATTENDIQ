import type { Database } from "@/lib/database.types";

export type Role = Database["public"]["Enums"]["user_role"];
export const ROLES: readonly Role[] = ["admin", "professor", "student", "operator"] as const;

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** Landing page for each role. */
export function homeForRole(role: Role): string {
  switch (role) {
    case "admin":
      return "/admin";
    case "operator":
      return "/operator";
    case "professor":
      return "/professor";
    case "student":
      return "/student";
  }
}

/** Which roles may open a path prefix. null = any signed-in user (or public, see PUBLIC_PATHS). */
const GUARDS: { prefix: string; roles: readonly Role[] }[] = [
  { prefix: "/admin", roles: ["admin"] },
  { prefix: "/operator", roles: ["operator", "admin"] },
  { prefix: "/professor", roles: ["professor"] },
  { prefix: "/student", roles: ["student"] },
  { prefix: "/sessions", roles: ["professor", "admin"] },
  { prefix: "/verify", roles: ["student"] },
];

export const PUBLIC_PATHS = ["/login", "/signup", "/reset-password", "/auth/confirm", "/forbidden"];

function matches(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(prefix + "/");
}

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => matches(pathname, p));
}

/** Roles allowed on this path, or null when any signed-in user may open it. */
export function allowedRoles(pathname: string): readonly Role[] | null {
  return GUARDS.find((g) => matches(pathname, g.prefix))?.roles ?? null;
}

export function canAccess(pathname: string, role: Role | null): boolean {
  if (isPublicPath(pathname)) return true;
  if (!role) return false;
  const roles = allowedRoles(pathname);
  return roles === null || roles.includes(role);
}
