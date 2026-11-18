import { PageHeader } from "@/components/app-shell";
import { FaceBadge } from "@/components/badges";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hhmm, seoulToday, weekdayLabel } from "@/lib/time";

// Face enrollment (Phase 4), notifications (Phase 3) and attendance history (Phase 7) build on this page.
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
  const active = (enrollments ?? []).filter((e) => !e.ends_on || e.ends_on >= today);
  return (
    <>
      <PageHeader title={`Hi, ${user.fullName}`} description="Your enrolled classes." />
      <p className="mb-4 text-sm">
        Face enrollment: <FaceBadge status={face?.status ?? "pending"} /> {face?.status !== "active" && <span className="text-muted-foreground">(guided enrollment arrives in Phase 4)</span>}
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
