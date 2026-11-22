import { Activity, BookOpen, Cpu, GraduationCap, Layers, PlayCircle, Radio, ScanFace, TrendingUp, TriangleAlert, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/app-shell";
import { DayBars, Empty, LiveDot, Panel, Ring, StatCard } from "@/components/dash";
import { StateBadge } from "@/components/state-badge";
import { deviceHealth } from "@/lib/status";
import { dailySeries, rateOf, type Att } from "@/lib/stats";
import { createClient } from "@/lib/supabase/server";
import { ageSeconds, fmtSeoul, seoulToday } from "@/lib/time";

const DAYS = 14;

export default async function AdminDashboard() {
  const supabase = await createClient();
  const today = seoulToday();
  const from = new Date(new Date(`${today}T00:00:00Z`).getTime() - (DAYS - 1) * 86_400_000).toISOString().slice(0, 10);
  const head = { count: "exact" as const, head: true };
  const weekAgo = new Date(new Date(`${today}T00:00:00Z`).getTime() - 6 * 86_400_000).toISOString().slice(0, 10);
  const [students, professors, courses, sections, review, pending, appeals, sessions, att, audit, devices, toReview] = await Promise.all([
    supabase.from("profiles").select("*", head).eq("role", "student").eq("is_simulated", false),
    supabase.from("profiles").select("*", head).eq("role", "professor"),
    supabase.from("courses").select("*", head),
    supabase.from("sections").select("*", head),
    supabase.from("face_profiles").select("*", head).eq("status", "review"),
    supabase.from("face_profiles").select("*", head).eq("status", "pending"),
    supabase.from("appeals").select("*", head).eq("status", "open"),
    supabase
      .from("class_sessions")
      .select("id, state, starts_at, ends_at, is_simulation, sections(section_no, courses(code)), rooms(code)")
      .eq("session_date", today)
      .neq("state", "cancelled")
      .order("starts_at"),
    supabase
      .from("attendance")
      .select("status, class_sessions!inner(session_date, is_simulation, state), profiles!attendance_student_id_fkey!inner(is_simulated)")
      .gte("class_sessions.session_date", from)
      .eq("class_sessions.is_simulation", false)
      .eq("profiles.is_simulated", false)
      .neq("class_sessions.state", "cancelled")
      .limit(10000),
    supabase.from("audit_log").select("id, at, action, entity, reason").order("at", { ascending: false }).limit(7),
    supabase.from("edge_devices").select("name, kind, last_seen").eq("is_active", true).order("name"),
    // Attendance the rules could not settle alone this week: not seen in the room, or a camera had a problem.
    supabase
      .from("attendance")
      .select("student_id, class_sessions!inner(session_date, is_simulation)", head)
      .overlaps("flags", ["unconfirmed", "needs_review"])
      .gte("class_sessions.session_date", weekAgo)
      .eq("class_sessions.is_simulation", false),
  ]);

  const rows = (att.data ?? []).map((r) => ({ date: r.class_sessions!.session_date, status: r.status as Att }));
  const series = dailySeries(rows, today, DAYS);
  const week = rateOf(rows.filter((r) => r.date >= series[DAYS - 7].date).map((r) => r.status));
  const todaySessions = (sessions.data ?? []).filter((s) => !s.is_simulation);
  const live = todaySessions.filter((s) => s.state === "live" || s.state === "recheck");
  const online = (devices.data ?? []).filter((d) => deviceHealth(ageSeconds(d.last_seen)) === "online").length;
  const attention = [
    { n: review.count ?? 0, text: "faces waiting for review", href: "/admin/faces" },
    { n: appeals.count ?? 0, text: "open appeals", href: "/admin/audit" },
    { n: pending.count ?? 0, text: "students without a face", href: "/admin/faces" },
    { n: toReview.count ?? 0, text: "attendance records to review (7 days)", href: "/admin/reports" },
  ].filter((a) => a.n > 0);

  return (
    <>
      <PageHeader title="Dashboard" description="Your university's attendance at a glance." />

      <nav className="aiq-stagger mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Quick actions">
        {[
          { href: "/admin/demo", label: "Start a class", icon: PlayCircle },
          { href: "/admin/people", label: "Add people", icon: UserPlus },
          { href: "/admin/faces", label: "Review faces", icon: ScanFace },
          { href: "/operator", label: "Cameras & devices", icon: Cpu },
        ].map((q) => (
          <Link key={q.href} href={q.href} className="aiq-lift flex items-center gap-2 rounded-xl border bg-card px-3 py-2.5 text-sm font-medium">
            <q.icon className="size-4 text-primary" />
            {q.label}
          </Link>
        ))}
      </nav>

      <div className="aiq-stagger grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        <StatCard label="Attendance (7 days)" value={week.pct === null ? "—" : `${week.pct}%`} icon={TrendingUp} tone="emerald" hint={`${week.attended} of ${week.total} records`} href="/admin/reports" />
        <StatCard label="Live classes now" value={<span className="inline-flex items-center gap-2">{live.length}{live.length > 0 && <LiveDot />}</span>} icon={Radio} tone="rose" hint={`${todaySessions.length} scheduled today`} />
        <StatCard label="Students" value={students.count ?? 0} icon={GraduationCap} tone="indigo" hint={`${professors.count ?? 0} professors`} href="/admin/people" />
        <StatCard label="Devices online" value={`${online}/${devices.data?.length ?? 0}`} icon={Cpu} tone="sky" hint="edge, ingest, cameras" href="/operator" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Panel title={`Attendance · last ${DAYS} days`} action={<Link href="/admin/reports" className="text-xs text-primary">Reports →</Link>}>
          <DayBars data={series} />
        </Panel>
        <Panel title="This week">
          <div className="flex items-center gap-5">
            <Ring pct={week.pct} size={104} stroke={10} sub="attended" />
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2"><BookOpen className="size-4 text-muted-foreground" />{courses.count ?? 0} courses</li>
              <li className="flex items-center gap-2"><Layers className="size-4 text-muted-foreground" />{sections.count ?? 0} sections</li>
              <li className="flex items-center gap-2"><Users className="size-4 text-muted-foreground" />{students.count ?? 0} students</li>
              <li className="flex items-center gap-2"><ScanFace className="size-4 text-muted-foreground" />{pending.count ?? 0} not enrolled</li>
            </ul>
          </div>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel title={`Today · ${fmtSeoul(new Date(), "MMM d")}`} className="lg:col-span-2">
          {todaySessions.length === 0 ? (
            <Empty>No classes today.</Empty>
          ) : (
            <ul className="divide-y">
              {todaySessions.map((s) => {
                const isLive = s.state === "live" || s.state === "recheck";
                return (
                  <li key={s.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                    <span className="w-24 tabular-nums text-muted-foreground">{fmtSeoul(s.starts_at, "HH:mm")}–{fmtSeoul(s.ends_at, "HH:mm")}</span>
                    <Link href={`/sessions/${s.id}`} className="font-medium hover:text-primary">
                      {s.sections?.courses?.code}-{s.sections?.section_no}
                    </Link>
                    <span className="text-muted-foreground">room {s.rooms?.code ?? "—"}</span>
                    <span className="ml-auto flex items-center gap-2">
                      {isLive && <LiveDot />}
                      <StateBadge state={s.state} />
                      {isLive && <Link href={`/sessions/${s.id}/dashboard`} className="text-xs text-primary">Live →</Link>}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel title="Needs attention" action={<TriangleAlert className="size-4 text-amber-500" />}>
          {attention.length === 0 ? (
            <Empty>All clear.</Empty>
          ) : (
            <ul className="space-y-2">
              {attention.map((a) => (
                <li key={a.text}>
                  <Link href={a.href} className="flex items-center justify-between rounded-xl border px-3 py-2.5 text-sm hover:bg-muted">
                    <span>{a.text}</span>
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 tabular-nums">{a.n}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Recent activity" action={<Link href="/admin/audit" className="text-xs text-primary">Audit log →</Link>}>
          <ul className="space-y-2.5">
            {(audit.data ?? []).map((a) => (
              <li key={a.id} className="flex gap-3 text-sm">
                <Activity className="mt-0.5 size-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{a.action}</span> {a.entity}
                  {a.reason && <span className="text-muted-foreground"> · {a.reason}</span>}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{fmtSeoul(a.at, "MM-dd HH:mm")}</span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Devices" action={<Link href="/operator" className="text-xs text-primary">Operator →</Link>}>
          <ul className="grid gap-2 sm:grid-cols-2">
            {(devices.data ?? []).map((d) => {
              const h = deviceHealth(ageSeconds(d.last_seen));
              return (
                <li key={d.name} className="flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm">
                  <span className={`size-2.5 rounded-full ${h === "online" ? "aiq-pulse bg-emerald-500 text-emerald-500" : h === "stale" ? "bg-amber-400" : "bg-slate-300"}`} />
                  <span className="min-w-0 flex-1 truncate">{d.name}</span>
                  <span className="text-xs text-muted-foreground">{d.kind}</span>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>
    </>
  );
}
