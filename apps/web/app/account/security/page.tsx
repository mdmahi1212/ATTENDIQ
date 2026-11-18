import Link from "next/link";
import { AuthCard } from "@/components/auth-card";
import { requireRole } from "@/lib/auth";
import { homeForRole } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { MfaEnroll } from "./mfa-enroll";

// TOTP enrolment for admin + operator accounts. Enforcement (aal2 required) is part of the Phase 8 hardening.
export default async function SecurityPage() {
  const user = await requireRole("admin", "operator");
  const supabase = await createClient();
  const { data } = await supabase.auth.mfa.listFactors();
  const initial = (data?.totp ?? []).map((f) => ({ id: f.id, name: f.friendly_name }));
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
      <MfaEnroll initial={initial} />
    </AuthCard>
  );
}
