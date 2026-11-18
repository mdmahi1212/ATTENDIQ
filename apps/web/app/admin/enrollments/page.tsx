import { PageHeader } from "@/components/app-shell";
import { FaceBadge, Pill, SimBadge } from "@/components/badges";
import { DataTable } from "@/components/data-table";
import { RowAction } from "@/components/form";
import { SimpleCreateForm } from "@/components/simple-create-form";
import { lookups } from "@/lib/lookups";
import { createClient } from "@/lib/supabase/server";
import { seoulToday } from "@/lib/time";
import { cancelInvite, dropStudent, inviteByEmail } from "./actions";
import { EnrollPicker } from "./enroll-picker";
import { SectionSwitcher } from "./section-switcher";

export default async function EnrollmentsPage({ searchParams }: PageProps<"/admin/enrollments">) {
  const { section } = await searchParams;
  const lk = await lookups();
  const sectionId = typeof section === "string" ? section : lk.sections[0]?.value;
  const today = seoulToday();

  if (!sectionId) {
    return <PageHeader title="Enrollments" description="Create a section first." />;
  }

  const supabase = await createClient();
  const [{ data: roster }, { data: students }, { data: invites }] = await Promise.all([
    supabase
      .from("enrollments")
      .select("student_id, starts_on, ends_on, profiles(full_name, email, student_no, is_simulated, face_profiles(status))")
      .eq("section_id", sectionId),
    supabase.from("profiles").select("id, full_name, student_no, email, is_simulated").eq("role", "student").eq("is_active", true).order("full_name"),
    supabase.from("pending_enrollments").select("email, created_at").eq("section_id", sectionId).order("created_at"),
  ]);
  const enrolledIds = new Set((roster ?? []).filter((r) => !r.ends_on || r.ends_on >= today).map((r) => r.student_id));
  const candidates = (students ?? [])
    .filter((s) => !enrolledIds.has(s.id))
    .map((s) => ({ id: s.id, label: `${s.full_name}${s.student_no ? ` · ${s.student_no}` : ""}${s.is_simulated ? " · SIM" : ""}`, search: `${s.full_name} ${s.email ?? ""} ${s.student_no ?? ""}` }));

  return (
    <>
      <PageHeader title="Enrollments" description="Enroll students in a section, drop with an end date, or invite by email before sign-up." />
      <SectionSwitcher sections={lk.sections} current={sectionId} />
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <EnrollPicker sectionId={sectionId} candidates={candidates} today={today} />
        <div className="space-y-3 rounded-lg border p-4">
          <h2 className="font-medium">Invite by email</h2>
          <SimpleCreateForm action={inviteByEmail} submit="Invite" hidden={{ section_id: sectionId }} fields={[{ name: "email", label: "Student email", type: "email", required: true }]} />
          <ul className="space-y-1 text-sm">
            {(invites ?? []).map((i) => (
              <li key={i.email} className="flex items-center justify-between">
                <span>{i.email} <Pill tone="amber">waiting for sign-up</Pill></span>
                <RowAction action={cancelInvite} fields={{ section_id: sectionId, email: i.email }} label="Remove" variant="ghost" />
              </li>
            ))}
          </ul>
        </div>
      </div>
      <DataTable
        searchPlaceholder="Search roster…"
        columns={[
          { id: "name", header: "Student", sortable: true },
          { id: "no", header: "No.", sortable: true },
          { id: "face", header: "Face" },
          { id: "period", header: "Enrolled" },
          { id: "actions", header: "", className: "text-right" },
        ]}
        rows={(roster ?? []).map((r) => {
          const p = r.profiles;
          const dropped = Boolean(r.ends_on && r.ends_on < today);
          return {
            id: r.student_id,
            search: `${p?.full_name} ${p?.email ?? ""} ${p?.student_no ?? ""}`,
            sort: { name: p?.full_name ?? "", no: p?.student_no ?? "" },
            cells: {
              name: (
                <span className="inline-flex items-center gap-1.5" data-testid="roster-name">
                  {p?.full_name} {p?.is_simulated && <SimBadge />} {dropped && <Pill tone="red">dropped</Pill>}
                </span>
              ),
              no: p?.student_no ?? "—",
              face: <FaceBadge status={p?.face_profiles?.status ?? "pending"} />,
              period: `${r.starts_on} → ${r.ends_on ?? "…"}`,
              actions: dropped ? null : (
                <RowAction
                  action={dropStudent}
                  fields={{ section_id: sectionId, student_id: r.student_id, ends_on: today }}
                  label="Drop today"
                  variant="destructive"
                  confirm="Drop this student from today?"
                />
              ),
            },
          };
        })}
      />
    </>
  );
}
