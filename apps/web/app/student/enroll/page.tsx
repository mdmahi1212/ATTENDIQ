import { PageHeader } from "@/components/app-shell";
import { FaceBadge } from "@/components/badges";
import { PushToggle } from "@/components/push-toggle";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Target of the enroll_face push. The guided camera + liveness capture is built in Phase 4.
export default async function EnrollPage() {
  const user = await requireRole("student");
  const supabase = await createClient();
  const { data: face } = await supabase.from("face_profiles").select("status").eq("student_id", user.id).maybeSingle();
  return (
    <>
      <PageHeader title="Face enrollment" description="Enroll your face once so the door camera can mark you present." />
      <p className="mb-4 text-sm">
        Current status: <FaceBadge status={face?.status ?? "pending"} />
      </p>
      <div className="mb-4 rounded-lg border p-4 text-sm">
        The guided capture (consent, liveness check, 10 photos) opens here in the next update. Turn on notifications so you
        get the reminder:
      </div>
      <div className="rounded-lg border p-4">
        <PushToggle />
      </div>
    </>
  );
}
