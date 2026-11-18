import Link from "next/link";
import { PageHeader } from "@/components/app-shell";
import { FaceBadge } from "@/components/badges";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { nextClass } from "@/lib/student";
import { fmtSeoul, hhmm, seoulToday, weekdayLabel } from "@/lib/time";

export default async function StudentHome() {
  const user = await requireRole("student");
  const supabase = await createClient();
  const today = seoulToday();
  const [{ data: enrollments }, { data: face }] = await Promise.all([
    supabase
      .from("enrollments")
      .select("starts_on, ends_on, sections(id, section_no, courses(code, title), rooms(code), timetable_slots(weekday, start_time, end_time))")
      .eq("student_id", user.id),
    supabase.from("face_profiles").select("status").eq("student_id", user.id).maybeSingle(),
  ]);
  // Open verification windows addressed to me (RLS: targets see their own requests).
  const { data: openReqs } = await supabase
    .from("verification_requests")
    .select("id, kind, closes_at, verification_targets!inner(student_id, passed_at)")
    .eq("status", "open")
    .eq("verification_targets.student_id", user.id)
    .is("verification_targets.passed_at", null)
    .gt("closes_at", new Date().toISOString());
  const active = (enrollments ?? []).filter((e) => !e.ends_on || e.ends_on >= today);
  const next = nextClass(
    active.filter((e) => e.sections).map((e) => ({ item: e.sections!, slots: e.sections!.timetable_slots })),
    new Date(),
  );
  return (
    <>
      <PageHeader title={`Hi, ${user.fullName}`} description="Your enrolled classes." />
      {(openReqs ?? []).map((r) => (
        <Link key={r.id} href={`/verify/${r.id}`} className="mb-4 block rounded-lg border border-amber-400 bg-amber-50 p-4 text-sm font-medium text-amber-900" data-testid="verify-banner">
          {r.kind === "recheck" ? "Confirm you are still in class" : "We couldn't confirm you: verify now"} (until {fmtSeoul(r.closes_at, "HH:mm")}) →
        </Link>
      ))}
      {next && (
        <div className="mb-4 rounded-lg border p-4" data-testid="next-class">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{next.ongoing ? "Now" : "Next class"}</p>
          <p className="text-lg font-semibold">
            {next.item.courses?.code}-{next.item.section_no} · {next.item.courses?.title}
          </p>
          <p className="text-sm text-muted-foreground">
            {fmtSeoul(next.startsAt, "EEE MM-dd HH:mm")}–{fmtSeoul(next.endsAt, "HH:mm")} · room {next.item.rooms?.code ?? "—"}
          </p>
        </div>
      )}
      <p className="mb-4 text-sm">
        Face enrollment: <FaceBadge status={face?.status ?? "pending"} />{" "}
        {face?.status !== "active" && (
          <Link href="/student/enroll" className="text-blue-700 underline-offset-2 hover:underline">
            Enroll now
          </Link>
        )}{" "}
        · <Link href="/student/attendance" className="text-blue-700 underline-offset-2 hover:underline">My attendance</Link>
      </p>
      <ul className="grid gap-3 md:grid-cols-2" data-testid="student-sections">
        {active.length === 0 && <li className="text-sm text-muted-foreground">You are not enrolled in any section yet.</li>}
        {active.map((e) => {
          const s = e.sections;
          if (!s) return null;
          return (
            <li key={s.id} className="rounded-lg border p-4 text-sm">
              <p className="font-medium">
                {s.courses?.code}-{s.section_no} · {s.courses?.title}
              </p>
              <p className="text-muted-foreground">
                Room {s.rooms?.code ?? "—"} · {s.timetable_slots.map((t) => `${weekdayLabel(t.weekday)} ${hhmm(t.start_time)}–${hhmm(t.end_time)}`).join(", ") || "no timetable"}
              </p>
            </li>
          );
        })}
      </ul>
    </>
  );
}
