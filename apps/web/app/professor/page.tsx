import { CalendarClock, Gavel, Radio, TrendingUp, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/app-shell";
import { Empty, LiveDot, Panel, Ring, StatCard } from "@/components/dash";
import { StateBadge } from "@/components/state-badge";
import { requireRole } from "@/lib/auth";
import { atRisk, rateOf, type Att } from "@/lib/stats";
import { createClient } from "@/lib/supabase/server";
import { fmtSeoul, hhmm, seoulToday, weekdayLabel } from "@/lib/time";

function greeting(hour: number): string {
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

export default async function ProfessorHome() {
  const user = await requireRole("professor");
  const supabase = await createClient();
  const today = seoulToday();
  const from = new Date(new Date(`${today}T00:00:00Z`).getTime() - 29 * 86_400_000).toISOString().slice(0, 10);
  const [{ data: sections }, { data: todayRows }, { data: att }, { count: openAppeals }] = await Promise.all([
    supabase
      .from("section_staff")
      .select("staff_role, sections(id, section_no, courses(code, title), semesters(name), rooms(code), enrollments(count), timetable_slots(weekday, start_time, end_time))")
      .eq("profile_id", user.id),
    supabase
      .from("class_sessions")
      .select("id, state, starts_at, ends_at, is_simulation, sections(section_no, courses(code, title)), rooms(code)")
      .eq("session_date", today)
      .neq("state", "cancelled")
      .order("starts_at"),
    supabase
      .from("attendance")
      .select("student_id, status, class_sessions!inner(section_id, session_date, is_simulation, state), profiles!attendance_student_id_fkey!inner(full_name, is_simulated)")
      .gte("class_sessions.session_date", from)
      .eq("class_sessions.is_simulation", false)
      .neq("class_sessions.state", "cancelled")
      .eq("profiles.is_simulated", false)
      .limit(10000),
    supabase.from("appeals").select("*", { count: "exact", head: true }).eq("status", "open"),
  ]);

  const mySections = (sections ?? []).map((s) => s.sections).filter((s): s is NonNullable<typeof s> => Boolean(s));
  const sectionIds = new Set(mySections.map((s) => s.id));
  const rows = (att ?? []).filter((r) => sectionIds.has(r.class_sessions!.section_id));
  const bySection = new Map<string, Att[]>();
  for (const r of rows) bySection.set(r.class_sessions!.section_id, [...(bySection.get(r.class_sessions!.section_id) ?? []), r.status as Att]);
  const overall = rateOf(rows.map((r) => r.status as Att));
  const names = new Map(rows.map((r) => [r.student_id, r.profiles?.full_name ?? "?"]));
  const code = new Map(mySections.map((s) => [s.id, `${s.courses?.code}-${s.section_no}`]));
  const risk = atRisk(rows.map((r) => ({ student: r.student_id, section: r.class_sessions!.section_id, status: r.status as Att })));
  const classes = (todayRows ?? []).filter((s) => !s.is_simulation);
  const live = classes.filter((s) => s.state === "live" || s.state === "recheck");
  const firstName = user.fullName.replace(/^(Prof\.?|Dr\.?)\s+/i, "").split(" ")[0];

  return (
    <>
      <PageHeader title={`${greeting(Number(fmtSeoul(new Date(), "H")))}, ${firstName}`} description="Your classes today and how your sections are doing." />

      <div className="aiq-stagger grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        <StatCard label="Classes today" value={classes.length} icon={CalendarClock} tone="indigo" hint={live.length ? `${live.length} live now` : "none live"} />
        <StatCard label="Live now" value={<span className="inline-flex items-center gap-2">{live.length}{live.length > 0 && <LiveDot />}</span>} icon={Radio} tone="rose" />
        <StatCard label="Attendance (30 days)" value={overall.pct === null ? "—" : `${overall.pct}%`} icon={TrendingUp} tone="emerald" hint={`${overall.attended} of ${overall.total}`} href="/professor/reports" />
        <StatCard label="Open appeals" value={openAppeals ?? 0} icon={Gavel} tone="amber" href="/professor/appeals" />
      </div>

      <Panel title="Today" className="mt-4">
        {classes.length === 0 ? (
          <Empty>No classes today. Enjoy the quiet.</Empty>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {classes.map((s) => {
              const isLive = s.state === "live" || s.state === "recheck";
              return (
                <li key={s.id} className={`aiq-lift rounded-2xl border p-4 ${isLive ? "border-emerald-300 bg-emerald-50/50 dark:bg-emerald-500/5" : ""}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm tabular-nums text-muted-foreground">
                      {fmtSeoul(s.starts_at, "HH:mm")}–{fmtSeoul(s.ends_at, "HH:mm")} · room {s.rooms?.code ?? "—"}
                    </span>
                    <span className="flex items-center gap-2">
                      {isLive && <LiveDot />}
                      <StateBadge state={s.state} />
                    </span>
                  </div>
                  <p className="mt-1 font-semibold">
                    {s.sections?.courses?.code}-{s.sections?.section_no} · {s.sections?.courses?.title}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <Link href={`/sessions/${s.id}`} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">
                      Open class
                    </Link>
                    <Link href={`/sessions/${s.id}/dashboard`} className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted">
                      Live dashboard
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <div className="mt-4 grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Panel title="My sections">
          <ul className="grid gap-3 sm:grid-cols-2">
            {(sections ?? []).map((st) => {
              const s = st.sections;
              if (!s) return null;
              const r = rateOf(bySection.get(s.id) ?? []);
              return (
                <li key={s.id} className="flex items-center gap-4 rounded-2xl border p-4">
                  <Ring pct={r.pct} size={64} stroke={6} />
                  <div className="min-w-0 text-sm">
                    <p className="truncate font-semibold">
                      {s.courses?.code}-{s.section_no}
                    </p>
                    <p className="truncate text-muted-foreground">{s.courses?.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.enrollments[0]?.count ?? 0} students · room {s.rooms?.code ?? "—"} · {st.staff_role}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {s.timetable_slots.map((t) => `${weekdayLabel(t.weekday)} ${hhmm(t.start_time)}`).join(", ") || "no timetable"}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>

        <Panel title="Students at risk" action={<TriangleAlert className="size-4 text-amber-500" />}>
          {risk.length === 0 ? (
            <Empty>Nobody below 85% in the last 30 days.</Empty>
          ) : (
            <ul className="space-y-2">
              {risk.slice(0, 8).map((r) => (
                <li key={`${r.student}-${r.section}`} className="flex items-center gap-3 rounded-xl border px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    {names.get(r.student)}
                    <span className="block text-xs text-muted-foreground">{code.get(r.section)} · {r.total} classes</span>
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${r.pct < 75 ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-800"}`}>{r.pct}%</span>
                </li>
              ))}
            </ul>
          )}
          <Link href="/professor/reports" className="mt-3 block text-xs text-primary">Full report and warnings →</Link>
        </Panel>
      </div>
    </>
  );
}
