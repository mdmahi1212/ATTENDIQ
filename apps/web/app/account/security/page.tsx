import Link from "next/link";
import { AuthCard } from "@/components/auth-card";
import { requireRoleBeforeMfa } from "@/lib/auth";
import { homeForRole } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { MfaEnroll } from "./mfa-enroll";
import { MfaVerify } from "./mfa-verify";

// TOTP for admin + operator accounts. With ENFORCE_MFA=true every admin/operator page sends an aal1 session here:
// enroll a first factor, or enter the code of an existing one (aal1 -> aal2).
export default async function SecurityPage({ searchParams }: PageProps<"/account/security">) {
  const user = await requireRoleBeforeMfa("admin", "operator");
  const sp = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.auth.mfa.listFactors();
  const verified = (data?.totp ?? []).filter((f) => f.status === "verified");
  const initial = (data?.totp ?? []).map((f) => ({ id: f.id, name: f.friendly_name }));
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const needsCode = verified.length > 0 && aal?.currentLevel !== "aal2";
  return (
    <AuthCard
      title="Two-factor authentication"
      description="Use an authenticator app (Google Authenticator, 1Password, …) for your admin/operator account."
      footer={
        <Link href={homeForRole(user.role)} className="hover:underline">
          Back
        </Link>
      }
    >
      {sp.mfa === "required" && (
        <p className="mb-3 rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">
          Two-factor authentication is required for {user.role} accounts. {needsCode ? "Enter your code to continue." : "Set it up to continue."}
        </p>
      )}
      {needsCode ? <MfaVerify factorId={verified[0].id} home={homeForRole(user.role)} /> : <MfaEnroll initial={initial} />}
    </AuthCard>
  );
}
