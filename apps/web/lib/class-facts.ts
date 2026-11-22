import "server-only";
import { atRisk, type Att } from "@/lib/stats";
import type { createClient } from "@/lib/supabase/server";
import { fmtSeoul } from "@/lib/time";
import type { ClassFacts } from "@/lib/class-summary";

type Supa = Awaited<ReturnType<typeof createClient>>;

/** Facts for the summary of one ENDED class (the caller's own RLS decides whether they may read it). */
export async function buildClassFacts(supabase: Supa, sessionId: string): Promise<ClassFacts | null> {
  const { data: s } = await supabase
    .from("class_sessions")
    .select("id, state, starts_at, ends_at, is_simulation, section_id, sections(section_no, courses(code, title))")
    .eq("id", sessionId)
    .maybeSingle();
  if (!s || s.state !== "ended") return null;
  const from = new Date(new Date(s.starts_at).getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
  const [{ data: rows }, { count: unknown }, { data: history }] = await Promise.all([
    supabase
      .from("attendance")
      .select("student_id, status, flags, note, first_seen_at, profiles!attendance_student_id_fkey(full_name, is_simulated)")
      .eq("session_id", sessionId),
    supabase.from("gate_events").select("*", { count: "exact", head: true }).eq("session_id", sessionId).eq("event_type", "GATE_ENTRY_UNKNOWN"),
    supabase
      .from("attendance")
      .select("student_id, status, class_sessions!inner(section_id, session_date, is_simulation, state), profiles!attendance_student_id_fkey!inner(is_simulated)")
      .eq("class_sessions.section_id", s.section_id)
      .gte("class_sessions.session_date", from)
      .eq("class_sessions.is_simulation", false)
      .neq("class_sessions.state", "cancelled")
      .eq("profiles.is_simulated", false)
      .limit(5000),
  ]);
  const real = (rows ?? []).filter((r) => s.is_simulation || !r.profiles?.is_simulated);
  const names = new Map(real.map((r) => [r.student_id, r.profiles?.full_name ?? "student"]));
  const start = new Date(s.starts_at).getTime();
  const risk = atRisk((history ?? []).map((h) => ({ student: h.student_id, section: s.section_id, status: h.status as Att })))
    .filter((r) => names.has(r.student))
    .map((r) => ({ name: names.get(r.student)!, pct: r.pct }));
  return {
    course: `${s.sections?.courses?.code}-${s.sections?.section_no} ${s.sections?.courses?.title ?? ""}`.trim(),
    date: `${fmtSeoul(s.starts_at, "yyyy-MM-dd HH:mm")}-${fmtSeoul(s.ends_at, "HH:mm")}`,
    students: real.map((r) => ({
      name: r.profiles?.full_name ?? "student",
      status: r.status,
      flags: r.flags ?? [],
      note: r.note,
      minutesLate: r.status === "late" && r.first_seen_at ? Math.round((new Date(r.first_seen_at).getTime() - start) / 60_000) : null,
    })),
    unknownEntries: unknown ?? 0,
    atRisk: risk,
  };
}
