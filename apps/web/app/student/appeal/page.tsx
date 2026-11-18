import Link from "next/link";
import { PageHeader } from "@/components/app-shell";
import { StatusBadge } from "@/components/badges";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtSeoul } from "@/lib/time";
import { AppealForm } from "./appeal-form";

export default async function AppealPage({ searchParams }: PageProps<"/student/appeal">) {
  const user = await requireRole("student");
  const { session } = await searchParams;
  const sessionId = typeof session === "string" && /^[0-9a-f-]{36}$/i.test(session) ? session : null;
  const supabase = await createClient();
  const { data: row } = sessionId
    ? await supabase
        .from("attendance")
        .select("status, class_sessions(starts_at, state, sections(section_no, courses(code, title)))")
        .eq("session_id", sessionId)
        .eq("student_id", user.id)
        .maybeSingle()
    : { data: null };
  if (!sessionId || !row) {
    return (
      <>
        <PageHeader title="Appeal" />
        <p className="text-sm">
          Class not found. Go back to <Link href="/student/attendance">My attendance</Link>.
        </p>
      </>
    );
  }
  const s = row.class_sessions;
  return (
    <>
      <PageHeader
        title="Appeal an attendance record"
        description={`${s?.sections?.courses?.code}-${s?.sections?.section_no} · ${fmtSeoul(s?.starts_at, "yyyy-MM-dd HH:mm")}`}
      />
      <p className="mb-4 text-sm">
        Current status: <StatusBadge status={row.status} />
      </p>
      <AppealForm sessionId={sessionId} userId={user.id} />
    </>
  );
}
