import Link from "next/link";
import { PageHeader } from "@/components/app-shell";
import { FaceBadge, Pill, SimBadge } from "@/components/badges";
import { DataTable } from "@/components/data-table";
import { buttonVariants } from "@/components/ui/button";
import { lookups } from "@/lib/lookups";
import { createClient } from "@/lib/supabase/server";
import { PersonForm } from "./person-form";
import { PersonRowActions } from "./person-row-actions";

export default async function PeoplePage() {
  const supabase = await createClient();
  const [{ departments }, { data: people }] = await Promise.all([
    lookups(),
    supabase
      .from("profiles")
      .select("id, full_name, email, role, student_no, is_active, is_simulated, departments(name), face_profiles(status)")
      .order("role")
      .order("full_name"),
  ]);
  return (
    <>
      <PageHeader
        title="People"
        description="Create staff and students. Each new account gets a one-time set-password link (no email server needed)."
        actions={
          <Link href="/admin/people/import" className={buttonVariants({ variant: "outline" })}>
            Import CSV
          </Link>
        }
      />
      <PersonForm departments={departments} />
      <DataTable
        searchPlaceholder="Search name, email, number…"
        columns={[
          { id: "name", header: "Name", sortable: true },
          { id: "email", header: "Email", sortable: true },
          { id: "role", header: "Role", sortable: true },
          { id: "no", header: "Student no." },
          { id: "face", header: "Face" },
          { id: "status", header: "Status" },
          { id: "actions", header: "", className: "text-right" },
        ]}
        rows={(people ?? []).map((p) => ({
          id: p.id,
          search: `${p.full_name} ${p.email ?? ""} ${p.student_no ?? ""} ${p.role}`,
          sort: { name: p.full_name, email: p.email ?? "", role: p.role },
          cells: {
            name: (
              <span className="inline-flex items-center gap-1.5">
                {p.full_name} {p.is_simulated && <SimBadge />}
              </span>
            ),
            email: p.email ?? "—",
            role: <Pill tone={p.role === "admin" ? "red" : p.role === "professor" ? "blue" : p.role === "operator" ? "amber" : "gray"}>{p.role}</Pill>,
            no: p.student_no ?? "—",
            face: p.role === "student" ? <FaceBadge status={p.face_profiles?.status ?? "pending"} /> : "—",
            status: p.is_active ? <Pill tone="green">active</Pill> : <Pill tone="red">inactive</Pill>,
            actions: <PersonRowActions id={p.id} email={p.email} role={p.role} active={p.is_active} simulated={p.is_simulated} />,
          },
        }))}
      />
    </>
  );
}
