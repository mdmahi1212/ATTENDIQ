import { describe, expect, it } from "vitest";
import { mfaEnforced, mfaSatisfied } from "@/lib/mfa";

describe("MFA enforcement", () => {
  it("is off unless ENFORCE_MFA=true", () => {
    expect(mfaEnforced(undefined)).toBe(false);
    expect(mfaEnforced("false")).toBe(false);
    expect(mfaEnforced(" TRUE ")).toBe(true);
  });
  it("admin and operator need aal2 when enforced; other roles never", () => {
    expect(mfaSatisfied("admin", "aal1", true)).toBe(false);
    expect(mfaSatisfied("operator", undefined, true)).toBe(false);
    expect(mfaSatisfied("admin", "aal2", true)).toBe(true);
    expect(mfaSatisfied("professor", "aal1", true)).toBe(true);
    expect(mfaSatisfied("student", "aal1", true)).toBe(true);
    expect(mfaSatisfied("admin", "aal1", false)).toBe(true);
  });
});
