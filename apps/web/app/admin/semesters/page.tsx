import { PageHeader } from "@/components/app-shell";
import { Pill } from "@/components/badges";
import { RowAction } from "@/components/form";
import { SimpleCreateForm } from "@/components/simple-create-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { addHoliday, createSemester, deleteHoliday } from "./actions";

export default async function SemestersPage() {
  const supabase = await createClient();
  const { data: semesters } = await supabase
    .from("semesters")
    .select("id, name, starts_on, ends_on, holidays(id, day, kind, name)")
    .order("starts_on", { ascending: false });

  return (
    <>
      <PageHeader title="Semesters & holidays" description="Sessions are generated only inside a semester and skipped on holidays and exam days." />
      <SimpleCreateForm
        action={createSemester}
        submit="Add semester"
        fields={[
          { name: "name", label: "Name", required: true, placeholder: "2027 Spring" },
          { name: "starts_on", label: "Starts", type: "date", required: true },
          { name: "ends_on", label: "Ends", type: "date", required: true },
        ]}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {(semesters ?? []).map((s) => (
          <Card key={s.id}>
            <CardHeader>
              <CardTitle>
                {s.name}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  {s.starts_on} → {s.ends_on}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <ul className="space-y-1 text-sm">
                {s.holidays.length === 0 && <li className="text-muted-foreground">No holidays.</li>}
                {[...s.holidays]
                  .sort((a, b) => a.day.localeCompare(b.day))
                  .map((h) => (
                    <li key={h.id} className="flex items-center justify-between gap-2">
                      <span>
                        {h.day} · {h.name ?? "—"} <Pill tone={h.kind === "exam" ? "amber" : "blue"}>{h.kind}</Pill>
                      </span>
                      <RowAction action={deleteHoliday} fields={{ id: h.id }} label="Remove" variant="ghost" />
                    </li>
                  ))}
              </ul>
              <SimpleCreateForm
                action={addHoliday}
                submit="Add day off"
                hidden={{ semester_id: s.id }}
                fields={[
                  { name: "day", label: "Date", type: "date", required: true },
                  { name: "kind", label: "Kind", options: [{ value: "holiday", label: "Holiday" }, { value: "exam", label: "Exam day" }] },
                  { name: "name", label: "Name" },
                ]}
              />
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
