import { PageHeader } from "@/components/app-shell";
import { FaceBadge } from "@/components/badges";
import { PushToggle } from "@/components/push-toggle";
import { requireRole } from "@/lib/auth";
import { CONSENT_VERSION } from "@/lib/consent";
import { createClient } from "@/lib/supabase/server";
import { fmtSeoul } from "@/lib/time";
import { ConsentForm, WithdrawConsent } from "./consent-form";
import { EnrollCamera } from "./enroll-camera";

const ENROLLABLE = new Set(["pending", "rejected", "deleted"]);

export default async function EnrollPage() {
  const user = await requireRole("student");
  const supabase = await createClient();
  const [{ data: face }, { data: consent }] = await Promise.all([
    supabase.from("face_profiles").select("status, enrolled_at").eq("student_id", user.id).maybeSingle(),
    supabase.from("biometric_consents").select("accepted_at").eq("student_id", user.id).eq("version", CONSENT_VERSION).is("withdrawn_at", null).maybeSingle(),
  ]);
  const status = face?.status ?? "pending";

  return (
    <>
      <PageHeader title="Face enrollment" description="Enroll your face once so the door camera can mark you present." />
      <p className="mb-4 text-sm">
        Current status: <FaceBadge status={status} />
        {status === "active" && face?.enrolled_at && <span className="text-muted-foreground"> since {fmtSeoul(face.enrolled_at)}</span>}
      </p>

      {!consent ? (
        <ConsentForm />
      ) : ENROLLABLE.has(status) ? (
        <EnrollCamera consentVersion={CONSENT_VERSION} />
      ) : (
        <div className="rounded-lg border p-4 text-sm">
          {status === "review"
            ? "Your enrollment is waiting for an admin to review it (possible duplicate face). You will get a notification."
            : "You are enrolled. If the door camera stops recognising you, ask an admin to reset your enrollment."}
        </div>
      )}

      <div className="mt-6 space-y-4">
        <div className="rounded-lg border p-4">
          <PushToggle />
        </div>
        {consent && <WithdrawConsent />}
      </div>
    </>
  );
}
