import { PageHeader } from "@/components/app-shell";
import { DataTable } from "@/components/data-table";
import { RowAction } from "@/components/form";
import { SimpleCreateForm } from "@/components/simple-create-form";
import { lookups } from "@/lib/lookups";
import { createClient } from "@/lib/supabase/server";
import { createCourse, deleteCourse } from "./actions";

export default async function CoursesPage() {
  const supabase = await createClient();
  const [{ departments }, { data }] = await Promise.all([
    lookups(),
    supabase.from("courses").select("id, code, title, credits, departments(name), sections(count)").order("code"),
  ]);
  return (
    <>
      <PageHeader title="Courses" />
      <SimpleCreateForm
        action={createCourse}
        submit="Add course"
        fields={[
          { name: "code", label: "Code", required: true, placeholder: "IOT401" },
          { name: "title", label: "Title", required: true },
          { name: "department_id", label: "Department", options: departments, placeholder: "—" },
          { name: "credits", label: "Credits", type: "number" },
        ]}
      />
      <DataTable
        searchPlaceholder="Search code or title…"
        columns={[
          { id: "code", header: "Code", sortable: true },
          { id: "title", header: "Title", sortable: true },
          { id: "dept", header: "Department" },
          { id: "credits", header: "Credits" },
          { id: "sections", header: "Sections" },
          { id: "actions", header: "", className: "text-right" },
        ]}
        rows={(data ?? []).map((c) => ({
          id: c.id,
          search: `${c.code} ${c.title}`,
          sort: { code: c.code, title: c.title },
          cells: {
            code: <span className="font-mono">{c.code}</span>,
            title: c.title,
            dept: c.departments?.name ?? "—",
            credits: c.credits ?? "—",
            sections: c.sections[0]?.count ?? 0,
            actions: <RowAction action={deleteCourse} fields={{ id: c.id }} label="Delete" variant="destructive" confirm={`Delete ${c.code}?`} />,
          },
        }))}
      />
    </>
  );
}
