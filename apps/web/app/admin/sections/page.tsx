import Link from "next/link";
import { PageHeader } from "@/components/app-shell";
import { Pill } from "@/components/badges";
import { RowAction } from "@/components/form";
import { SimpleCreateForm } from "@/components/simple-create-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { lookups } from "@/lib/lookups";
import { createClient } from "@/lib/supabase/server";
import { hhmm, weekdayLabel } from "@/lib/time";
import { STAFF_ROLES } from "@/lib/validation";
import { assignStaff, createSection, deleteSection, removeStaff, startTestSession } from "./actions";

export default async function SectionsPage() {
  const supabase = await createClient();
  const [lk, { data: sections }] = await Promise.all([
    lookups(),
    supabase
      .from("sections")
      .select(
        "id, section_no, courses(code, title), semesters(name), rooms(code), section_staff(staff_role, profiles(id, full_name)), enrollments(count), timetable_slots(weekday, start_time, end_time)",
      )
      .order("section_no"),
  ]);

  return (
    <>
      <PageHeader title="Sections" description="A course offered in a semester, with its room and staff." />
      <SimpleCreateForm
        action={createSection}
        submit="Add section"
        fields={[
          { name: "course_id", label: "Course", options: lk.courses, placeholder: "Choose…", required: true },
          { name: "semester_id", label: "Semester", options: lk.semesters, placeholder: "Choose…", required: true },
          { name: "section_no", label: "Section no.", required: true, placeholder: "01" },
          { name: "room_id", label: "Room", options: lk.rooms, placeholder: "—" },
        ]}
      />
      <div className="grid gap-4 xl:grid-cols-2">
        {(sections ?? [])
          .sort((a, b) => `${a.courses?.code}${a.section_no}`.localeCompare(`${b.courses?.code}${b.section_no}`))
          .map((s) => (
            <Card key={s.id} data-testid={`section-${s.courses?.code}-${s.section_no}`}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {s.courses?.code}-{s.section_no}{" "}
                    <span className="text-sm font-normal text-muted-foreground">
                      {s.courses?.title} · {s.semesters?.name}
                    </span>
                  </span>
                  <span className="inline-flex gap-1">
                    <RowAction
                      action={startTestSession}
                      fields={{ id: s.id, minutes: "30" }}
                      label="Start 30-min test session"
                      variant="outline"
                      confirm="Start a real attendance session for this section now (30 min)? Enrolled students who are not seen will be marked absent at the end."
                    />
                    <RowAction action={deleteSection} fields={{ id: s.id }} label="Delete" variant="destructive" confirm="Delete this section?" />
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p>
                  Room <strong>{s.rooms?.code ?? "—"}</strong> ·{" "}
                  <Link className="underline" href={`/admin/enrollments?section=${s.id}`}>
                    {s.enrollments[0]?.count ?? 0} enrolled
                  </Link>{" "}
                  ·{" "}
                  {s.timetable_slots.length
                    ? s.timetable_slots.map((t) => `${weekdayLabel(t.weekday)} ${hhmm(t.start_time)}–${hhmm(t.end_time)}`).join(", ")
                    : "no timetable"}
                </p>
                <ul className="space-y-1">
                  {s.section_staff.map((st) => (
                    <li key={st.profiles?.id} className="flex items-center justify-between">
                      <span>
                        {st.profiles?.full_name} <Pill tone="blue">{st.staff_role}</Pill>
                      </span>
                      <RowAction action={removeStaff} fields={{ section_id: s.id, profile_id: st.profiles?.id ?? "" }} label="Remove" variant="ghost" />
                    </li>
                  ))}
                  {s.section_staff.length === 0 && <li className="text-muted-foreground">No staff assigned.</li>}
                </ul>
                <SimpleCreateForm
                  action={assignStaff}
                  submit="Assign"
                  hidden={{ section_id: s.id }}
                  fields={[
                    { name: "profile_id", label: "Professor / TA", options: lk.staff, placeholder: "Choose…", required: true },
                    { name: "staff_role", label: "Role", options: STAFF_ROLES.map((r) => ({ value: r, label: r })) },
                  ]}
                />
              </CardContent>
            </Card>
          ))}
      </div>
    </>
  );
}
