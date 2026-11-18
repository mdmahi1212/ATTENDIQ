import Link from "next/link";
import { PageHeader } from "@/components/app-shell";
import { Pill, SimBadge } from "@/components/badges";
import { DataTable } from "@/components/data-table";
import { buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { lookups } from "@/lib/lookups";
import { loadReport, reportFilterSchema } from "@/lib/report-data";

export default async function ReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  const sp = await searchParams;
  const lk = await lookups();
  const parsed = reportFilterSchema.safeParse({
    section: typeof sp.section === "string" ? sp.section : lk.sections[0]?.value,
    from: typeof sp.from === "string" && sp.from ? sp.from : undefined,
    to: typeof sp.to === "string" && sp.to ? sp.to : undefined,
    sim: sp.sim === "1" ? "1" : undefined,
  });
  const report = parsed.success ? await loadReport(parsed.data) : null;
  const qs = parsed.success
    ? new URLSearchParams(Object.entries(parsed.data).filter(([, v]) => v) as [string, string][]).toString()
    : "";

  return (
    <>
      <PageHeader
        title="Reports"
        description="Attendance % per student over held sessions (cancelled sessions and pending reviews are not counted)."
        actions={
          report && (
            <Link href={`/admin/reports/export?${qs}`} className={buttonVariants({ variant: "outline" })} prefetch={false}>
              Export CSV
            </Link>
          )
        }
      />
      <form className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border p-4" method="get">
        <div className="grid gap-1.5">
          <Label htmlFor="r-section">Section</Label>
          <select id="r-section" name="section" defaultValue={parsed.success ? parsed.data.section : ""} className="h-8 rounded-lg border px-2 text-sm">
            {lk.sections.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="r-from">From</Label>
          <input id="r-from" type="date" name="from" defaultValue={parsed.success ? parsed.data.from : ""} className="h-8 rounded-lg border px-2 text-sm" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="r-to">To</Label>
          <input id="r-to" type="date" name="to" defaultValue={parsed.success ? parsed.data.to : ""} className="h-8 rounded-lg border px-2 text-sm" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="sim" value="1" defaultChecked={parsed.success && parsed.data.sim === "1"} /> include SIM students
        </label>
        <button type="submit" className={buttonVariants()}>
          Show
        </button>
      </form>
      {!report ? (
        <p className="text-sm text-muted-foreground">Pick a section.</p>
      ) : (
        <>
          <p className="mb-3 text-sm text-muted-foreground">{report.sessions} held sessions in this section.</p>
          <DataTable
            searchPlaceholder="Search student…"
            columns={[
              { id: "name", header: "Student", sortable: true },
              { id: "held", header: "Held", sortable: true },
              { id: "present", header: "Present", sortable: true },
              { id: "late", header: "Late", sortable: true },
              { id: "absent", header: "Absent", sortable: true },
              { id: "left_early", header: "Left early", sortable: true },
              { id: "excused", header: "Excused", sortable: true },
              { id: "pending", header: "Review" },
              { id: "pct", header: "%", sortable: true },
            ]}
            rows={report.summary.map((r) => ({
              id: r.student_id,
              search: `${r.full_name} ${r.student_no}`,
              sort: { name: r.full_name, held: r.held, present: r.present, late: r.late, absent: r.absent, left_early: r.left_early, excused: r.excused, pct: r.pct ?? -1 },
              cells: {
                name: (
                  <span className="inline-flex items-center gap-1.5">
                    {r.full_name} {r.is_simulated && <SimBadge />}
                  </span>
                ),
                held: r.held,
                present: r.present,
                late: r.late,
                absent: r.absent,
                left_early: r.left_early,
                excused: r.excused,
                pending: r.pending,
                pct:
                  r.pct === null ? (
                    "—"
                  ) : (
                    <Pill tone={r.pct < report.warn[1] ? "red" : r.pct < report.warn[0] ? "amber" : "green"}>{r.pct}%</Pill>
                  ),
              },
            }))}
          />
        </>
      )}
    </>
  );
}
