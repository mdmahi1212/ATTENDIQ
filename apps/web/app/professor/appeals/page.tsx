import { PageHeader } from "@/components/app-shell";
import { Pill, StatusBadge } from "@/components/badges";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtSeoul } from "@/lib/time";
import { DecideForm } from "./decide-form";

export default async function AppealsQueue() {
  await requireRole("professor", "admin");
  const supabase = await createClient();
  // RLS: professors see appeals of their own sections only.
  const { data: appeals } = await supabase
    .from("appeals")
    .select(
      "id, session_id, student_id, reason, requested_status, attachment_path, status, decision_note, decided_at, created_at, attendance(status, profiles!attendance_student_id_fkey(full_name, student_no), class_sessions(starts_at, sections(section_no, courses(code))))",
    )
    .order("status")
    .order("created_at", { ascending: false })
    .limit(100);
  const rows = (appeals ?? []).map((r) => ({ ...r, profiles: r.attendance?.profiles, class_sessions: r.attendance?.class_sessions }));
  const signed = new Map<string, string>();
  for (const r of rows.filter((x) => x.attachment_path && x.status === "open")) {
    const { data } = await supabase.storage.from("appeal-files").createSignedUrl(r.attachment_path!, 300);
    if (data?.signedUrl) signed.set(r.id, data.signedUrl);
  }
  const open = rows.filter((r) => r.status === "open");
  const done = rows.filter((r) => r.status !== "open");

  return (
    <>
      <PageHeader title="Appeals" description="Students' requests to change a finished class's record. Approving changes the record (audited, with your note)." />
      <h2 className="mb-2 font-semibold">Open ({open.length})</h2>
      {open.length === 0 && <p className="mb-6 text-sm text-muted-foreground">No open appeals.</p>}
      <ul className="mb-8 space-y-3" data-testid="open-appeals">
        {open.map((r) => (
          <li key={r.id} className="rounded-lg border p-3 text-sm" data-appeal={r.id}>
            <p className="mb-1">
              <strong>{r.profiles?.full_name}</strong> <span className="text-muted-foreground">{r.profiles?.student_no}</span> ·{" "}
              {r.class_sessions?.sections?.courses?.code}-{r.class_sessions?.sections?.section_no} {fmtSeoul(r.class_sessions?.starts_at, "yyyy-MM-dd HH:mm")}
            </p>
            <p className="mb-1 inline-flex flex-wrap items-center gap-1.5">
              <StatusBadge status={r.attendance?.status ?? "pending"} /> → <StatusBadge status={r.requested_status} />
              <span className="text-xs text-muted-foreground">filed {fmtSeoul(r.created_at, "MM-dd HH:mm")}</span>
            </p>
            <p className="mb-2 whitespace-pre-wrap">{r.reason}</p>
            {signed.has(r.id) && (
              <p className="mb-2">
                <a href={signed.get(r.id)} target="_blank" rel="noreferrer" className="text-blue-700 underline">
                  Open attached evidence (link valid 5 min)
                </a>
              </p>
            )}
            <DecideForm appealId={r.id} />
          </li>
        ))}
      </ul>
      <h2 className="mb-2 font-semibold">Decided</h2>
      <ul className="divide-y rounded-lg border text-sm">
        {done.length === 0 && <li className="px-3 py-2 text-muted-foreground">None yet.</li>}
        {done.map((r) => (
          <li key={r.id} className="px-3 py-2">
            <Pill tone={r.status === "approved" ? "green" : "red"}>{r.status}</Pill> {r.profiles?.full_name} · {r.class_sessions?.sections?.courses?.code}{" "}
            {fmtSeoul(r.class_sessions?.starts_at, "MM-dd")} → {r.requested_status}
            <span className="text-muted-foreground"> · “{r.decision_note}” · {fmtSeoul(r.decided_at, "MM-dd HH:mm")}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
