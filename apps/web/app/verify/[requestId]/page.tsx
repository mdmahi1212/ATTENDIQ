import { PageHeader } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { fmtSeoul } from "@/lib/time";
import { MAX_ATTEMPTS } from "@/lib/verify/decision";
import { loadRequestContext, windowOpen } from "@/lib/verify/server";
import { VerifyFlow } from "./verify-flow";

export default async function VerifyPage({ params }: PageProps<"/verify/[requestId]">) {
  const user = await requireRole("student");
  const { requestId } = await params;
  const admin = createAdminClient();
  const rc = /^[0-9a-f-]{36}$/i.test(requestId) ? await loadRequestContext(admin, requestId, user.id) : null;
  const { data: face } = await admin.from("face_profiles").select("status").eq("student_id", user.id).maybeSingle();
  const serverNow = new Date();
  const { data: course } = rc
    ? await admin.from("sections").select("section_no, courses(code, title), rooms(code)").eq("id", rc.session.section_id).maybeSingle()
    : { data: null };

  const header = (
    <PageHeader
      title={rc?.request.kind === "recheck" ? "Confirm you are still in class" : "Verify you are in class"}
      description={course ? `${course.courses?.code}-${course.section_no} · ${course.courses?.title} · room ${course.rooms?.code ?? "—"}` : undefined}
    />
  );
  const box = (msg: string) => (
    <>
      {header}
      <p className="rounded-lg border p-4 text-sm">{msg}</p>
    </>
  );

  if (!rc) return box("This verification link is not valid.");
  if (!rc.eligible) return box("You are not asked to verify in this class (you may already be marked present).");
  if (rc.passed) return box("Done: you are verified for this class.");
  if (!windowOpen(rc.request, serverNow.getTime())) return box(`This verification window closed at ${fmtSeoul(rc.request.closes_at, "HH:mm:ss")}. If you were in class, contact your professor or file an appeal.`);

  return (
    <>
      {header}
      <VerifyFlow
        requestId={requestId}
        closesAt={rc.request.closes_at}
        serverNow={serverNow.toISOString()}
        requireQr={rc.requireQr}
        attemptsLeft={MAX_ATTEMPTS - rc.attempts}
        faceEnrolled={face?.status === "active"}
      />
    </>
  );
}
