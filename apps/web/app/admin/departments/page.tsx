import { PageHeader } from "@/components/app-shell";
import { DataTable } from "@/components/data-table";
import { RowAction } from "@/components/form";
import { createClient } from "@/lib/supabase/server";
import { createDepartment, deleteDepartment } from "./actions";
import { SimpleCreateForm } from "@/components/simple-create-form";

export default async function DepartmentsPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("departments").select("id, name, courses(count), profiles(count)").order("name");
  return (
    <>
      <PageHeader title="Departments" />
      <SimpleCreateForm action={createDepartment} fields={[{ name: "name", label: "Department name", required: true }]} submit="Add department" />
      <DataTable
        columns={[
          { id: "name", header: "Name", sortable: true },
          { id: "courses", header: "Courses" },
          { id: "people", header: "People" },
          { id: "actions", header: "", className: "text-right" },
        ]}
        rows={(data ?? []).map((d) => ({
          id: d.id,
          search: d.name,
          sort: { name: d.name },
          cells: {
            name: d.name,
            courses: d.courses[0]?.count ?? 0,
            people: d.profiles[0]?.count ?? 0,
            actions: <RowAction action={deleteDepartment} fields={{ id: d.id }} label="Delete" variant="destructive" confirm={`Delete ${d.name}?`} />,
          },
        }))}
      />
    </>
  );
}
