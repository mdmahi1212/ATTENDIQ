import Link from "next/link";
import { PageHeader } from "@/components/app-shell";
import { Pill, SimBadge } from "@/components/badges";
import { RowAction } from "@/components/form";
import { PrintButton } from "@/components/print-button";
import { buttonVariants } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { loadReport, reportFilterSchema } from "@/lib/report-data";
import { createClient } from "@/lib/supabase/server";
import { warnAtRisk } from "../actions";

export default async function ProfessorReports({ searchParams }: PageProps<"/professor/reports">) {
  const user = await requireRole("professor", "admin");
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: staff } = await supabase.from("section_staff").select("sections(id, section_no, courses(code, title))").eq("profile_id", user.id);
  const sections = (staff ?? []).map((s) => s.sections).filter((s): s is NonNullable<typeof s> => !!s);
  const parsed = reportFilterSchema.safeParse({ section: typeof sp.section === "string" ? sp.section : sections[0]?.id, sim: sp.sim === "1" ? "1" : undefined });
  const report = parsed.success ? await loadReport(parsed.data) : null;
  const current = sections.find((s) => parsed.success && s.id === parsed.data.section);
  const atRisk = (report?.summary ?? []).filter((r) => r.pct !== null && r.held > 0 && r.pct < report!.warn[0]);
  const qs = parsed.success ? new URLSearchParams(Object.entries(parsed.data).filter(([, v]) => v) as [string, string][]).toString() : "";

  return (
    <>
      <PageHeader
        title={`Report${current ? `: ${current.courses?.code}-${current.section_no}` : ""}`}
        description="Attendance % per student over held classes. Students under the warning threshold are listed first."
        actions={
          report && (
            <span className="inline-flex gap-2 print:hidden">
              <Link href={`/api/reports/export?${qs}`} className={buttonVariants({ variant: "outline" })} prefetch={false}>
                Export CSV
              </Link>
              <PrintButton />
            </span>
          )
        }
      />
      <form method="get" className="mb-4 flex flex-wrap items-end gap-2 print:hidden">
        <select name="section" defaultValue={parsed.success ? parsed.data.section : ""} className="h-8 rounded-lg border px-2 text-sm" aria-label="Section">
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.courses?.code}-{s.section_no} · {s.courses?.title}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" name="sim" value="1" defaultChecked={sp.sim === "1"} /> include SIM students
        </label>
        <button className={buttonVariants({ size: "sm" })}>Show</button>
      </form>
      {!report ? (
        <p className="text-sm text-muted-foreground">You have no sections yet.</p>
      ) : (
        <>
          <p className="mb-3 text-sm text-muted-foreground">
            {report.sessions} held classes · warning below {report.warn[0]}%, critical below {report.warn[1]}%
          </p>
          <section className="mb-6 rounded-lg border p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">At risk ({atRisk.length})</h2>
              {atRisk.length > 0 && parsed.success && (
                <span className="print:hidden">
                  <RowAction action={warnAtRisk} fields={{ section_id: parsed.data.section }} label="Warn at-risk students" />
                </span>
              )}
            </div>
            {atRisk.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nobody below {report.warn[0]}%.</p>
            ) : (
              <ul className="text-sm" data-testid="at-risk">
                {atRisk.map((r) => (
                  <li key={r.student_id}>
                    <Pill tone={r.pct! < report.warn[1] ? "red" : "amber"}>{r.pct}%</Pill> {r.full_name} {r.is_simulated && <SimBadge />}{" "}
                    <span className="text-muted-foreground">({r.absent} absent, {r.late} late of {r.held})</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <table className="w-full text-sm">
            <thead className="border-b text-left text-xs text-muted-foreground">
              <tr>
                {["Student", "No.", "Held", "Present", "Late", "Absent", "Left early", "Excused", "Review", "%"].map((h) => (
                  <th key={h} className="px-2 py-1.5">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {report.summary.map((r) => (
                <tr key={r.student_id} className="break-inside-avoid">
                  <td className="px-2 py-1">{r.full_name}</td>
                  <td className="px-2 py-1 tabular-nums">{r.student_no}</td>
                  {[r.held, r.present, r.late, r.absent, r.left_early, r.excused, r.pending].map((v, i) => (
                    <td key={i} className="px-2 py-1 tabular-nums">
                      {v}
                    </td>
                  ))}
                  <td className="px-2 py-1 tabular-nums">{r.pct === null ? "—" : `${r.pct}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}
