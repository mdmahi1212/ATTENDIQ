import Link from "next/link";
import { PageHeader } from "@/components/app-shell";
import { StateBadge } from "@/components/state-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { fmtSeoul, seoulToday } from "@/lib/time";

export default async function AdminDashboard() {
  const supabase = await createClient();
  const today = seoulToday();
  const head = { count: "exact" as const, head: true };
  const [students, sims, professors, courses, sections, rooms, devices, review, pending, sessions] = await Promise.all([
    supabase.from("profiles").select("*", head).eq("role", "student").eq("is_simulated", false),
    supabase.from("profiles").select("*", head).eq("is_simulated", true),
    supabase.from("profiles").select("*", head).eq("role", "professor"),
    supabase.from("courses").select("*", head),
    supabase.from("sections").select("*", head),
    supabase.from("rooms").select("*", head),
    supabase.from("edge_devices").select("*", head),
    supabase.from("face_profiles").select("*", head).eq("status", "review"),
    supabase.from("face_profiles").select("*", head).eq("status", "pending"),
    supabase
      .from("class_sessions")
      .select("id, state, starts_at, ends_at, sections(section_no, courses(code)), rooms(code)")
      .eq("session_date", today)
      .order("starts_at"),
  ]);

  const tiles = [
    { label: "Students", value: students.count, href: "/admin/people" },
    { label: "Simulated students", value: sims.count, href: "/admin/people" },
    { label: "Professors", value: professors.count, href: "/admin/people" },
    { label: "Courses", value: courses.count, href: "/admin/courses" },
    { label: "Sections", value: sections.count, href: "/admin/sections" },
    { label: "Rooms", value: rooms.count, href: "/admin/rooms" },
    { label: "Edge devices", value: devices.count, href: "/operator" },
    { label: "Faces to review", value: review.count, href: "/admin/faces" },
    { label: "Faces not enrolled", value: pending.count, href: "/admin/faces" },
  ];

  return (
    <>
      <PageHeader title="Dashboard" description="University setup at a glance." />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map((t) => (
          <Link key={t.label} href={t.href}>
            <Card className="h-full transition-colors hover:bg-muted/40">
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">{t.label}</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold tabular-nums">{t.value ?? 0}</CardContent>
            </Card>
          </Link>
        ))}
      </div>
      <h2 className="mt-8 mb-3 font-semibold">Today&apos;s sessions ({today})</h2>
      {(sessions.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">No sessions today.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {(sessions.data ?? []).map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
              <span>
                {s.sections?.courses?.code}-{s.sections?.section_no} · room {s.rooms?.code ?? "—"}
              </span>
              <span className="text-muted-foreground">
                {fmtSeoul(s.starts_at, "HH:mm")}–{fmtSeoul(s.ends_at, "HH:mm")}
              </span>
              <StateBadge state={s.state} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
