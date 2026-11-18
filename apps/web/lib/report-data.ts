import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { summarize, type ReportInput } from "@/lib/report";
import { policySchema } from "@/lib/validation";

export const reportFilterSchema = z.object({
  section: z.guid(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  sim: z.enum(["1"]).optional(),
});
export type ReportFilter = z.infer<typeof reportFilterSchema>;

/** Per-student summary for one section over held (ended/locked) sessions, RLS-scoped to the caller. */
export async function loadReport(f: ReportFilter) {
  const supabase = await createClient();
  let q = supabase
    .from("attendance")
    .select("student_id, status, class_sessions!inner(section_id, session_date, state), profiles!attendance_student_id_fkey(full_name, student_no, is_simulated)")
    .eq("class_sessions.section_id", f.section)
    .in("class_sessions.state", ["ended", "locked"]);
  if (f.from) q = q.gte("class_sessions.session_date", f.from);
  if (f.to) q = q.lte("class_sessions.session_date", f.to);
  const [{ data, error }, { data: pol }, { count: sessions }] = await Promise.all([
    q,
    supabase.from("settings").select("value").eq("key", "policy").maybeSingle(),
    supabase.from("class_sessions").select("*", { count: "exact", head: true }).eq("section_id", f.section).in("state", ["ended", "locked"]),
  ]);
  if (error) throw new Error(error.message);
  const policy = policySchema.safeParse(pol?.value);
  const rows: ReportInput[] = (data ?? [])
    .filter((r) => f.sim === "1" || !r.profiles?.is_simulated)
    .map((r) => ({
      student_id: r.student_id,
      status: r.status,
      full_name: r.profiles?.full_name ?? "?",
      student_no: r.profiles?.student_no ?? null,
      is_simulated: r.profiles?.is_simulated ?? false,
    }));
  const summary = summarize(rows, {
    lateWeight: policy.success ? policy.data.late_weight : 1,
    leftEarly: policy.success ? policy.data.left_early_counts_as : "absent",
  });
  const warn = policy.success ? policy.data.warn_attendance_pct : ([85, 75] as [number, number]);
  return { summary, sessions: sessions ?? 0, warn };
}
