import { ArrowRight, CalendarClock, Flame, MapPin, ScanFace, Sparkles } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/app-shell";
import { FaceBadge, StatusBadge } from "@/components/badges";
import { Empty, Panel, Ring } from "@/components/dash";
import { requireRole } from "@/lib/auth";
import { rateOf, type Att } from "@/lib/stats";
import { nextClass } from "@/lib/student";
import { createClient } from "@/lib/supabase/server";
import { fmtSeoul, hhmm, seoulToday, weekdayLabel } from "@/lib/time";

export default async function StudentHome() {
  const user = await requireRole("student");
  const supabase = await createClient();
  const today = seoulToday();
  const [{ data: enrollments }, { data: face }, { data: records }] = await Promise.all([
    supabase
      .from("enrollments")
      .select("starts_on, ends_on, sections(id, section_no, courses(code, title), rooms(code), timetable_slots(weekday, start_time, end_time))")
      .eq("student_id", user.id),
    supabase.from("face_profiles").select("status").eq("student_id", user.id).maybeSingle(),
    supabase
      .from("attendance")
      .select("status, class_sessions!inner(id, section_id, starts_at, is_simulation, state, sections(section_no, courses(code)))")
      .eq("student_id", user.id)
      .eq("class_sessions.is_simulation", false)
      .neq("class_sessions.state", "cancelled")
      .limit(1000),
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
  const recs = (records ?? [])
    .map((r) => ({ status: r.status as Att, s: r.class_sessions! }))
    .sort((a, b) => b.s.starts_at.localeCompare(a.s.starts_at));
  const overall = rateOf(recs.map((r) => r.status));
  let streak = 0;
  for (const r of recs) {
    if (r.status === "pending" || r.status === "excused") continue;
    if (r.status === "present" || r.status === "late") streak++;
    else break;
  }
  const bySection = new Map<string, Att[]>();
  for (const r of recs) bySection.set(r.s.section_id, [...(bySection.get(r.s.section_id) ?? []), r.status]);
  const firstName = user.fullName.split(" ")[0];
  const faceActive = face?.status === "active";

  return (
    <>
      <PageHeader title={`Hi, ${firstName}`} description="Your classes, attendance and anything that needs you." />

      {(openReqs ?? []).map((r) => (
        <Link
          key={r.id}
          href={`/verify/${r.id}`}
          className="aiq-enter mb-4 flex items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-medium text-amber-900"
          data-testid="verify-banner"
        >
          <span className="aiq-pulse grid size-9 shrink-0 place-items-center rounded-full bg-amber-400 text-amber-400">
            <ScanFace className="size-5 text-amber-950" />
          </span>
          <span className="flex-1">
            {r.kind === "recheck" ? "Confirm you are still in class" : "We couldn't confirm you: verify now"} (until {fmtSeoul(r.closes_at, "HH:mm")})
          </span>
          <ArrowRight className="size-4" />
        </Link>
      ))}

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        {next ? (
          <section className="aiq-brand-bg relative overflow-hidden rounded-3xl p-5 text-white md:p-6" data-testid="next-class">
            <div className="pointer-events-none absolute -top-16 -right-10 size-56 rounded-full bg-white/10 blur-2xl" />
            <p className="relative inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium">
              <CalendarClock className="size-3.5" /> {next.ongoing ? "Now" : "Next class"}
            </p>
            <p className="relative mt-3 text-2xl font-semibold">
              {next.item.courses?.code}-{next.item.section_no}
            </p>
            <p className="relative text-white/80">{next.item.courses?.title}</p>
            <div className="relative mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm text-white/85">
              <span>{fmtSeoul(next.startsAt, "EEE MM-dd HH:mm")}–{fmtSeoul(next.endsAt, "HH:mm")}</span>
              <span className="inline-flex items-center gap-1"><MapPin className="size-4" /> room {next.item.rooms?.code ?? "—"}</span>
            </div>
            <p className="relative mt-4 text-xs text-white/70">Walk in facing the door camera; you are marked present in about a second.</p>
          </section>
        ) : (
          <Panel title="Next class"><Empty>No upcoming class in your timetable.</Empty></Panel>
        )}

        <section className="grid grid-cols-2 gap-3">
          <div className="flex flex-col items-center justify-center rounded-2xl border bg-card p-4">
            <Ring pct={overall.pct} size={92} stroke={9} sub="attended" />
            <p className="mt-2 text-xs text-muted-foreground">{overall.attended} of {overall.total} classes</p>
          </div>
          <div className="flex flex-col justify-between rounded-2xl border bg-card p-4">
            <span className="grid size-9 place-items-center rounded-xl bg-orange-50 text-orange-500 dark:bg-orange-500/15"><Flame className="size-5" /></span>
            <div>
              <p className="text-3xl font-semibold tabular-nums">{streak}</p>
              <p className="text-xs text-muted-foreground">classes in a row</p>
            </div>
          </div>
          <Link href={faceActive ? "/student/settings" : "/student/enroll"} className="aiq-lift col-span-2 flex items-center gap-3 rounded-2xl border bg-card p-4">
            <span className={`grid size-10 place-items-center rounded-xl ${faceActive ? "bg-emerald-50 text-emerald-600" : "bg-indigo-50 text-indigo-600"}`}>
              {faceActive ? <ScanFace className="size-5" /> : <Sparkles className="size-5" />}
            </span>
            <span className="flex-1 text-sm">
              <span className="block font-medium">Face enrollment</span>
              <FaceBadge status={face?.status ?? "pending"} />
            </span>
            {!faceActive && <span className="text-xs font-medium text-primary">Enroll now →</span>}
          </Link>
        </section>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="By course">
          <ul className="grid gap-3 sm:grid-cols-2" data-testid="student-sections">
            {active.length === 0 && <li className="text-sm text-muted-foreground">You are not enrolled in any section yet.</li>}
            {active.map((e) => {
              const s = e.sections;
              if (!s) return null;
              const r = rateOf(bySection.get(s.id) ?? []);
              return (
                <li key={s.id} className="flex items-center gap-3 rounded-2xl border p-3">
                  <Ring pct={r.pct} size={56} stroke={6} />
                  <div className="min-w-0 text-sm">
                    <p className="truncate font-semibold">
                      {s.courses?.code}-{s.section_no}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{s.courses?.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {s.timetable_slots.map((t) => `${weekdayLabel(t.weekday)} ${hhmm(t.start_time)}–${hhmm(t.end_time)}`).join(", ") || "no timetable"} · room {s.rooms?.code ?? "—"}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>

        <Panel title="Recent classes" action={<Link href="/student/attendance" className="text-xs text-primary">All attendance →</Link>}>
          {recs.length === 0 ? (
            <Empty>No attendance records yet.</Empty>
          ) : (
            <ul className="divide-y">
              {recs.slice(0, 6).map((r) => (
                <li key={r.s.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className="w-20 shrink-0 text-xs text-muted-foreground tabular-nums">{fmtSeoul(r.s.starts_at, "MM-dd HH:mm")}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {r.s.sections?.courses?.code}-{r.s.sections?.section_no}
                  </span>
                  <StatusBadge status={r.status} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
