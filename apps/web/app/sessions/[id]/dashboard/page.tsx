import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app-shell";
import { SimBadge } from "@/components/badges";
import { StateBadge } from "@/components/state-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth";
import { insideAt, timeInClass, windowEnd, type DoorEvent } from "@/lib/dashboard";
import { deviceHealth } from "@/lib/status";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { ageSeconds, fmtSeoul } from "@/lib/time";
import { LiveRefresh } from "../live-refresh";

const W = 640;
const H = 170;
const PAD = 28;

/** Professor's live room dashboard: numbers, room count vs present, door timeline, time in class, devices. */
export default async function SessionDashboardPage({ params }: PageProps<"/sessions/[id]/dashboard">) {
  await requireRole("professor", "admin");
  const { id } = await params;
  const supabase = await createClient();
  const { data: session } = await supabase
    .from("class_sessions")
    .select("id, state, starts_at, ends_at, staff_count, is_simulation, room_id, sections(section_no, courses(code, title)), rooms(code)")
    .eq("id", id)
    .maybeSingle();
  if (!session) notFound(); // RLS: staff of the section or admin

  const [{ data: roster }, { data: gate }, { data: occ }, { data: devices }] = await Promise.all([
    supabase
      .from("attendance")
      .select("student_id, status, method, first_seen_at, profiles!attendance_student_id_fkey(full_name, is_simulated)")
      .eq("session_id", id),
    supabase.from("gate_events").select("event_type, student_id, ts").eq("session_id", id).order("ts").limit(3000),
    supabase.from("occupancy_samples").select("smoothed, stable, ts").eq("session_id", id).order("ts").limit(3000),
    session.room_id
      ? createAdminClient().from("edge_devices").select("name, kind, last_seen").eq("room_id", session.room_id).eq("is_active", true)
      : Promise.resolve({ data: [] as { name: string; kind: string; last_seen: string | null }[] }),
  ]);

  const live = session.state === "live" || session.state === "recheck";
  const start = new Date(session.starts_at).getTime();
  const end = windowEnd(session.ends_at, live);
  const rows = (roster ?? []).filter((r) => session.is_simulation || !r.profiles?.is_simulated);
  const names = new Map(rows.map((r) => [r.student_id, r.profiles?.full_name ?? "?"]));

  const door: DoorEvent[] = [];
  for (const g of gate ?? []) {
    if (!g.student_id || !names.has(g.student_id)) continue;
    if (g.event_type === "GATE_ENTRY_RECOGNISED") door.push({ type: "in", student: g.student_id, at: new Date(g.ts).getTime() });
    if (g.event_type === "GATE_PERSON_OUT") door.push({ type: "out", student: g.student_id, at: new Date(g.ts).getTime() });
  }
  const fallback = new Map<string, number>();
  for (const r of rows) if (r.first_seen_at && r.method && r.method !== "gate") fallback.set(r.student_id, new Date(r.first_seen_at).getTime());
  const times = timeInClass(door, start, Math.max(end, start), fallback);

  const present = rows.filter((r) => r.status === "present" || r.status === "late").length;
  const notArrived = rows.filter((r) => r.status === "pending").length;
  // Recognised going out and not back in (during class: still present; after finalize: absent, left_no_return).
  const leftNotBack = rows.filter((r) => r.status !== "pending" && times.get(r.student_id)?.lastOut && !times.get(r.student_id)?.inNow).length;
  const samples = (occ ?? []).map((o) => ({ t: new Date(o.ts).getTime(), n: Math.max(0, o.smoothed - session.staff_count), stable: o.stable }));
  const counted = samples.at(-1)?.n ?? null;

  // Chart: room count (camera) vs students inside by door events.
  const span = Math.max(end - start, 60_000);
  const x = (t: number) => PAD + ((t - start) / span) * (W - PAD * 2);
  const yMax = Math.max(1, rows.length ? Math.min(rows.length, Math.max(...samples.map((s) => s.n), present) + 1) : 1, ...samples.map((s) => s.n));
  const y = (n: number) => H - PAD - (n / yMax) * (H - PAD * 2);
  const camLine = samples.map((s) => `${x(s.t).toFixed(1)},${y(s.n).toFixed(1)}`).join(" ");
  const steps = 60;
  const presLine = Array.from({ length: steps + 1 }, (_, i) => start + (span * i) / steps)
    .map((t) => `${x(t).toFixed(1)},${y(insideAt(times, t)).toFixed(1)}`)
    .join(" ");

  const timeline = (gate ?? [])
    .filter((g) => ["GATE_ENTRY_RECOGNISED", "GATE_ENTRY_UNKNOWN", "GATE_PERSON_OUT"].includes(g.event_type))
    .slice(-25)
    .reverse();
  const people = [...times.entries()].sort((a, b) => (names.get(a[0]) ?? "").localeCompare(names.get(b[0]) ?? ""));
  const title = `${session.sections?.courses?.code ?? "?"}-${session.sections?.section_no ?? ""} · room ${session.rooms?.code ?? "—"}`;

  return (
    <>
      <PageHeader
        title={`${title} · live dashboard`}
        description={`${fmtSeoul(session.starts_at, "yyyy-MM-dd HH:mm")}–${fmtSeoul(session.ends_at, "HH:mm")} (Seoul)`}
        actions={
          <span className="inline-flex items-center gap-3">
            {session.is_simulation && <SimBadge />}
            <StateBadge state={session.state} />
            {live && <LiveRefresh sessionId={id} />}
            <Link href={`/sessions/${id}`} className="text-sm underline underline-offset-4">
              Class page
            </Link>
          </span>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Marked present", value: present, tone: "" },
          { label: "In the room (camera)", value: counted ?? "—", tone: counted !== null && counted !== present ? "text-amber-600" : "" },
          { label: "Left, not back", value: leftNotBack, tone: leftNotBack ? "text-amber-600" : "" },
          { label: "Not arrived", value: notArrived, tone: "" },
        ].map((k) => (
          <Card key={k.label}>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">{k.label}</p>
              <p className={`text-3xl font-semibold tabular-nums ${k.tone}`} data-testid={`dash-${k.label}`}>
                {k.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mb-4 grid gap-3 lg:grid-cols-[3fr_2fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">People in the room vs students inside (door)</CardTitle>
          </CardHeader>
          <CardContent>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Room count and students inside over the class">
              <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} className="stroke-border" />
              <text x={4} y={y(0) + 4} className="fill-muted-foreground text-[11px]">0</text>
              <text x={4} y={y(yMax) + 4} className="fill-muted-foreground text-[11px]">{yMax}</text>
              <text x={PAD} y={H - 8} className="fill-muted-foreground text-[11px]">{fmtSeoul(new Date(start), "HH:mm")}</text>
              <text x={W - PAD - 30} y={H - 8} className="fill-muted-foreground text-[11px]">{fmtSeoul(new Date(start + span), "HH:mm")}</text>
              <polyline fill="none" stroke="#7F77DD" strokeWidth={2} points={presLine} />
              {camLine && <polyline fill="none" stroke="#1D9E75" strokeWidth={2} strokeDasharray="5 3" points={camLine} />}
            </svg>
            <p className="mt-1 text-xs text-muted-foreground">
              <span className="text-[#534AB7]">━ students inside (door events)</span> · <span className="text-[#0F6E56]">╍ people counted by the room camera</span>
              {!samples.length && " · no room camera data yet"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Door timeline</CardTitle>
          </CardHeader>
          <CardContent>
            {timeline.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nobody has passed the door cameras yet.</p>
            ) : (
              <ul className="space-y-1 text-sm" data-testid="door-timeline">
                {timeline.map((g, i) => {
                  const who = g.student_id ? names.get(g.student_id) ?? "student" : null;
                  const text =
                    g.event_type === "GATE_ENTRY_RECOGNISED" ? `${who} came in` : g.event_type === "GATE_PERSON_OUT" ? (who ? `${who} left` : "someone left (not recognised)") : "unknown face at the door";
                  const tone = g.event_type === "GATE_ENTRY_RECOGNISED" ? "text-green-700" : g.event_type === "GATE_PERSON_OUT" ? "text-amber-700" : "text-red-700";
                  return (
                    <li key={`${g.ts}-${i}`} className="flex gap-3">
                      <span className="w-16 shrink-0 tabular-nums text-muted-foreground">{fmtSeoul(g.ts, "HH:mm:ss")}</span>
                      <span className={tone}>{text}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-sm">Time in class (from door events)</CardTitle>
        </CardHeader>
        <CardContent>
          {people.length === 0 ? (
            <p className="text-sm text-muted-foreground">No student has been seen yet.</p>
          ) : (
            <div className="grid grid-cols-[minmax(6rem,10rem)_1fr_7rem] items-center gap-x-3 gap-y-2 text-sm" data-testid="time-in-class">
              {people.map(([sid, t]) => (
                <div key={sid} className="contents">
                  <span className="truncate">{names.get(sid)}</span>
                  <div className="relative h-2.5 rounded bg-muted">
                    {t.segments.map((s, i) => (
                      <div
                        key={i}
                        className={`absolute h-2.5 rounded ${t.inNow ? "bg-[#7F77DD]" : "bg-[#D85A30]"}`}
                        style={{ left: `${((s.from - start) / span) * 100}%`, width: `${Math.max(0.5, ((s.to - s.from) / span) * 100)}%` }}
                      />
                    ))}
                  </div>
                  <span className={`tabular-nums ${!t.inNow && t.lastOut ? "text-amber-700" : "text-muted-foreground"}`}>
                    {!t.inNow && t.lastOut ? `left ${fmtSeoul(new Date(t.lastOut), "HH:mm")}` : `${t.minutes} min`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2 text-xs" data-testid="device-strip">
        {(devices ?? []).map((d) => {
          const h = deviceHealth(ageSeconds(d.last_seen));
          const tone = h === "online" ? "bg-green-50 text-green-800" : h === "stale" ? "bg-amber-50 text-amber-800" : "bg-red-50 text-red-800";
          return (
            <span key={d.name} className={`rounded px-2.5 py-1 ${tone}`}>
              {d.name} ({d.kind}) · {h}
            </span>
          );
        })}
        {counted !== null && counted !== present && (
          <span className="rounded bg-amber-50 px-2.5 py-1 text-amber-800">count {counted} vs present {present}</span>
        )}
      </div>
    </>
  );
}
