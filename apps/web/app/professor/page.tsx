import Link from "next/link";
import { PageHeader } from "@/components/app-shell";
import { StateBadge } from "@/components/state-badge";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtSeoul, hhmm, seoulToday, weekdayLabel } from "@/lib/time";

export default async function ProfessorHome() {
  const user = await requireRole("professor");
  const supabase = await createClient();
  const [{ data: sections }, { data: today }] = await Promise.all([
    supabase
      .from("section_staff")
      .select("staff_role, sections(id, section_no, courses(code, title), semesters(name), rooms(code), enrollments(count), timetable_slots(weekday, start_time, end_time))")
      .eq("profile_id", user.id),
    supabase.from("class_sessions").select("id, state, starts_at, ends_at, sections(section_no, courses(code))").eq("session_date", seoulToday()).order("starts_at"),
  ]);
  return (
    <>
      <PageHeader title="My sections" description="Open today's class for the live dashboard." />
      <h2 className="mb-2 font-semibold">Today</h2>
      <ul className="mb-6 divide-y rounded-lg border text-sm">
        {(today ?? []).length === 0 && <li className="px-3 py-2 text-muted-foreground">No classes today.</li>}
        {(today ?? []).map((s) => (
          <li key={s.id} className="flex items-center justify-between px-3 py-2">
            <Link href={`/sessions/${s.id}`} className="font-medium underline-offset-2 hover:underline">
              {s.sections?.courses?.code}-{s.sections?.section_no} · {fmtSeoul(s.starts_at, "HH:mm")}–{fmtSeoul(s.ends_at, "HH:mm")}
            </Link>
            <StateBadge state={s.state} />
          </li>
        ))}
      </ul>
      <ul className="grid gap-3 md:grid-cols-2">
        {(sections ?? []).map((st) => {
          const s = st.sections;
          if (!s) return null;
          return (
            <li key={s.id} className="rounded-lg border p-4 text-sm">
              <p className="font-medium">
                {s.courses?.code}-{s.section_no} · {s.courses?.title}
              </p>
              <p className="text-muted-foreground">
                {s.semesters?.name} · room {s.rooms?.code ?? "—"} · {s.enrollments[0]?.count ?? 0} students · {st.staff_role}
              </p>
              <p className="text-muted-foreground">
                {s.timetable_slots.map((t) => `${weekdayLabel(t.weekday)} ${hhmm(t.start_time)}`).join(", ") || "no timetable"}
              </p>
            </li>
          );
        })}
      </ul>
    </>
  );
}
