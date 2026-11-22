import Link from "next/link";
import { PageHeader } from "@/components/app-shell";
import { Pill, StatusBadge } from "@/components/badges";
import { requireRole } from "@/lib/auth";
import { appealOpen, heatmap, type DayStatus } from "@/lib/student";
import { createClient } from "@/lib/supabase/server";
import { fmtSeoul, seoulToday } from "@/lib/time";

const CELL: Record<DayStatus, string> = {
  present: "bg-green-500",
  late: "bg-amber-400",
  absent: "bg-red-500",
  left_early: "bg-orange-500",
  excused: "bg-blue-400",
  pending: "bg-gray-400",
};
const METHOD: Record<string, string> = { gate: "door camera", self_verify: "self-verify", recheck: "recheck", manual: "set by professor", appeal: "appeal" };
const FLAG: Record<string, string> = { gate_out: "went out", reentry: "came back", very_late: "very late", needs_review: "under review", manual_check: "manual check asked", recheck_failed: "missed the recheck", unconfirmed: "not seen in the room (professor review)", left_no_return: "left and did not come back" };

export default async function MyAttendance() {
  const user = await requireRole("student");
  const supabase = await createClient();
  const [{ data: rows }, { data: appeals }, { data: policy }] = await Promise.all([
    supabase
      .from("attendance")
      .select("session_id, status, method, first_seen_at, flags, note, class_sessions!inner(state, starts_at, ends_at, session_date, is_simulation, section_id, sections(id, section_no, courses(code, title)))")
      .eq("student_id", user.id)
      .eq("class_sessions.is_simulation", false)
      .order("session_date", { referencedTable: "class_sessions", ascending: false }),
    supabase.from("appeals").select("id, session_id, status, requested_status, decision_note, created_at").eq("student_id", user.id).order("created_at", { ascending: false }),
    supabase.from("settings").select("value").eq("key", "policy").maybeSingle(),
  ]);
  const appealDays = Number((policy?.value as { appeal_days?: number } | null)?.appeal_days ?? 7);
  const openAppeal = new Set((appeals ?? []).filter((a) => a.status === "open").map((a) => a.session_id));
  const today = seoulToday();
  const now = new Date();

  // group by section
  const sections = new Map<string, { title: string; rows: NonNullable<typeof rows> }>();
  for (const r of rows ?? []) {
    const s = r.class_sessions.sections;
    const key = r.class_sessions.section_id;
    if (!sections.has(key)) sections.set(key, { title: `${s?.courses?.code}-${s?.section_no} · ${s?.courses?.title}`, rows: [] });
    sections.get(key)!.rows.push(r);
  }
  const summaries = new Map(
    await Promise.all(
      [...sections.keys()].map(async (sid) => {
        const { data } = await supabase.rpc("attendance_summary", { p_student: user.id, p_section: sid });
        return [sid, data?.[0] ?? null] as const;
      }),
    ),
  );

  return (
    <>
      <PageHeader title="My attendance" description="Per course: attendance %, a calendar of the last 12 weeks, every class with how it was recorded, and appeals." />
      {sections.size === 0 && <p className="text-sm text-muted-foreground">No classes recorded yet.</p>}
      {[...sections.entries()].map(([sid, sec]) => {
        const sm = summaries.get(sid);
        const cols = heatmap(
          sec.rows.map((r) => ({ date: r.class_sessions.session_date, status: r.status as DayStatus })),
          today,
        );
        return (
          <section key={sid} className="mb-8 rounded-lg border p-4" data-testid={`course-${sid}`}>
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-semibold">{sec.title}</h2>
              <p className="text-sm">
                <span className="text-2xl font-semibold tabular-nums">{sm?.pct ?? "—"}%</span>{" "}
                <span className="text-muted-foreground">
                  of {sm?.held ?? 0} classes · {sm?.present ?? 0} present · {sm?.late ?? 0} late · {sm?.absent ?? 0} absent · {sm?.left_early ?? 0} left early · {sm?.excused ?? 0} excused
                </span>
              </p>
            </div>
            <div className="mb-4 flex gap-1 overflow-x-auto" aria-label="Attendance calendar">
              {cols.map((col, i) => (
                <div key={i} className="flex flex-col gap-1">
                  {col.map((c) => (
                    <span key={c.date} title={`${c.date}${c.status ? `: ${c.status}` : ""}`} className={`size-3.5 rounded-sm ${c.status ? CELL[c.status] : "bg-muted"}`} />
                  ))}
                </div>
              ))}
            </div>
            <ul className="divide-y text-sm">
              {sec.rows.map((r) => {
                const s = r.class_sessions;
                const appeal = (appeals ?? []).find((a) => a.session_id === r.session_id);
                const can = appealOpen({ state: s.state, ends_at: s.ends_at, status: r.status, appeal_days: appealDays, has_open_appeal: openAppeal.has(r.session_id) }, now);
                return (
                  <li key={r.session_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="inline-flex flex-wrap items-center gap-2">
                      <span className="tabular-nums">{fmtSeoul(s.starts_at, "MM-dd HH:mm")}</span>
                      <StatusBadge status={r.status} />
                      <span className="text-muted-foreground">
                        {r.method ? METHOD[r.method] ?? r.method : s.state === "live" ? "class running" : "no evidence"}
                        {r.first_seen_at ? ` at ${fmtSeoul(r.first_seen_at, "HH:mm")}` : ""}
                      </span>
                      {r.flags.filter((f) => FLAG[f]).map((f) => (
                        <Pill key={f} tone="gray">
                          {FLAG[f]}
                        </Pill>
                      ))}
                      {r.note && <span className="text-xs text-muted-foreground">“{r.note}”</span>}
                    </span>
                    <span className="text-xs">
                      {appeal && (
                        <Pill tone={appeal.status === "approved" ? "green" : appeal.status === "rejected" ? "red" : "amber"}>
                          appeal {appeal.status}
                          {appeal.decision_note ? `: ${appeal.decision_note}` : ""}
                        </Pill>
                      )}{" "}
                      {can.ok && (
                        <Link href={`/student/appeal?session=${r.session_id}`} className="font-medium text-blue-700 underline-offset-2 hover:underline">
                          Appeal
                        </Link>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </>
  );
}
