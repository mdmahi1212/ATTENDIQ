import { PageHeader } from "@/components/app-shell";
import { FaceBadge, SimBadge } from "@/components/badges";
import { DataTable } from "@/components/data-table";
import { RowAction } from "@/components/form";
import { SimpleCreateForm } from "@/components/simple-create-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { fmtSeoul } from "@/lib/time";
import { approveFace, forceReenroll, rejectFace, remindPending } from "./actions";

const STATUSES = ["pending", "active", "review", "rejected", "deleted"] as const;

export default async function FacesPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("face_profiles")
    .select("student_id, status, enrolled_at, model_version, review_note, updated_at, profiles(full_name, email, student_no, is_simulated)")
    .order("updated_at", { ascending: false });
  const rows = data ?? [];
  const counts = Object.fromEntries(STATUSES.map((s) => [s, rows.filter((r) => r.status === s).length]));
  const review = rows.filter((r) => r.status === "review");
  // Review thumbnails (private bucket, admin-only storage policy): short-lived signed URLs.
  const thumbs = new Map<string, string>();
  if (review.length) {
    const { data: signed } = await supabase.storage.from("face-review").createSignedUrls(review.map((r) => `${r.student_id}.jpg`), 300);
    for (const s of signed ?? []) if (s.signedUrl && s.path) thumbs.set(s.path.replace(/\.jpg$/, ""), s.signedUrl);
  }

  return (
    <>
      <PageHeader title="Face enrollment" description="Who has enrolled, who must be reviewed (possible duplicate face), and who needs a reminder." />
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {STATUSES.map((s) => (
          <Card key={s}>
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                <FaceBadge status={s} />
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold tabular-nums">{counts[s]}</CardContent>
          </Card>
        ))}
      </div>
      <SimpleCreateForm action={remindPending} fields={[]} submit="Send reminder to all pending (real) students" />

      <h2 className="mb-2 font-semibold">Review queue ({review.length})</h2>
      {review.length === 0 ? (
        <p className="mb-6 text-sm text-muted-foreground">Nothing to review.</p>
      ) : (
        <ul className="mb-6 divide-y rounded-lg border">
          {review.map((r) => (
            <li key={r.student_id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className="inline-flex items-center gap-3">
                {thumbs.has(r.student_id) ? (
                  // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL, not worth next/image config
                  <img src={thumbs.get(r.student_id)} alt="" className="size-14 rounded object-cover" />
                ) : (
                  <span className="grid size-14 place-items-center rounded bg-muted text-xs text-muted-foreground">no photo</span>
                )}
                <span>
                <strong>{r.profiles?.full_name}</strong> {r.profiles?.email} — {r.review_note ?? "flagged by duplicate check"}
                </span>
              </span>
              <span className="inline-flex gap-1">
                <RowAction action={approveFace} fields={{ student_id: r.student_id }} label="Approve" />
                <RowAction action={rejectFace} fields={{ student_id: r.student_id }} label="Reject" variant="destructive" confirm="Reject and delete these embeddings?" />
              </span>
            </li>
          ))}
        </ul>
      )}

      <DataTable
        searchPlaceholder="Search student…"
        columns={[
          { id: "name", header: "Student", sortable: true },
          { id: "status", header: "Status", sortable: true },
          { id: "enrolled", header: "Enrolled at", sortable: true },
          { id: "model", header: "Model" },
          { id: "actions", header: "", className: "text-right" },
        ]}
        rows={rows.map((r) => ({
          id: r.student_id,
          search: `${r.profiles?.full_name} ${r.profiles?.email ?? ""} ${r.profiles?.student_no ?? ""} ${r.status}`,
          sort: { name: r.profiles?.full_name ?? "", status: r.status, enrolled: r.enrolled_at ?? "" },
          cells: {
            name: (
              <span className="inline-flex items-center gap-1.5">
                {r.profiles?.full_name} {r.profiles?.is_simulated && <SimBadge />}
              </span>
            ),
            status: <FaceBadge status={r.status} />,
            enrolled: fmtSeoul(r.enrolled_at),
            model: r.model_version ?? "—",
            actions:
              r.status === "active" || r.status === "rejected" ? (
                <RowAction action={forceReenroll} fields={{ student_id: r.student_id }} label="Force re-enroll" confirm="Delete this face profile and ask the student to enroll again?" />
              ) : null,
          },
        }))}
      />
    </>
  );
}
