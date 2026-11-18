import { describe, expect, it } from "vitest";
import { allowedRoles, canAccess, homeForRole, isPublicPath, isRole } from "@/lib/roles";

describe("roles / route guard", () => {
  it("maps every role to its portal", () => {
    expect(homeForRole("admin")).toBe("/admin");
    expect(homeForRole("operator")).toBe("/operator");
    expect(homeForRole("professor")).toBe("/professor");
    expect(homeForRole("student")).toBe("/student");
  });

  it("students cannot open /admin or /operator", () => {
    expect(canAccess("/admin", "student")).toBe(false);
    expect(canAccess("/admin/courses", "student")).toBe(false);
    expect(canAccess("/operator", "student")).toBe(false);
    expect(canAccess("/student", "student")).toBe(true);
  });

  it("operator portal is open to operator and admin only", () => {
    expect(canAccess("/operator", "operator")).toBe(true);
    expect(canAccess("/operator/cameras/x", "admin")).toBe(true);
    expect(canAccess("/operator", "professor")).toBe(false);
    expect(canAccess("/admin", "operator")).toBe(false);
  });

  it("prefix matching does not leak to look-alike paths", () => {
    expect(allowedRoles("/administrator")).toBeNull();
    expect(allowedRoles("/admin")).toEqual(["admin"]);
    expect(allowedRoles("/students")).toBeNull();
  });

  it("public pages need no session; everything else does", () => {
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/auth/confirm")).toBe(true);
    expect(canAccess("/login", null)).toBe(true);
    expect(canAccess("/update-password", null)).toBe(false);
    expect(canAccess("/update-password", "student")).toBe(true);
  });

  it("isRole rejects unknown values", () => {
    expect(isRole("admin")).toBe(true);
    expect(isRole("device")).toBe(false);
    expect(isRole(undefined)).toBe(false);
  });
});
