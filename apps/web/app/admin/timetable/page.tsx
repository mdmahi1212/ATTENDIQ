import { PageHeader } from "@/components/app-shell";
import { Pill } from "@/components/badges";
import { DataTable } from "@/components/data-table";
import { RowAction } from "@/components/form";
import { SimpleCreateForm } from "@/components/simple-create-form";
import { lookups } from "@/lib/lookups";
import { createClient } from "@/lib/supabase/server";
import { hhmm, WEEKDAYS, weekdayLabel } from "@/lib/time";
import { createSlot, deleteSlot, toggleSlot } from "./actions";

export default async function TimetablePage() {
  const supabase = await createClient();
  const [lk, { data: slots }] = await Promise.all([
    lookups(),
    supabase
      .from("timetable_slots")
      .select("id, weekday, start_time, end_time, is_active, rooms(code), sections(section_no, rooms(code), courses(code), semesters(name))")
      .order("weekday")
      .order("start_time"),
  ]);
  return (
    <>
      <PageHeader title="Timetable" description="Weekly slots in Asia/Seoul time. The pg_cron tick turns today's slots into sessions (skipping holidays)." />
      <SimpleCreateForm
        action={createSlot}
        submit="Add slot"
        fields={[
          { name: "section_id", label: "Section", options: lk.sections, placeholder: "Choose…", required: true },
          { name: "weekday", label: "Day", options: WEEKDAYS.map((d, i) => ({ value: String(i + 1), label: d })), required: true },
          { name: "start_time", label: "Start", type: "time", required: true, defaultValue: "10:30" },
          { name: "end_time", label: "End", type: "time", required: true, defaultValue: "11:45" },
          { name: "room_id", label: "Room override", options: lk.rooms, placeholder: "Section room" },
        ]}
      />
      <DataTable
        columns={[
          { id: "day", header: "Day", sortable: true },
          { id: "time", header: "Time", sortable: true },
          { id: "section", header: "Section", sortable: true },
          { id: "room", header: "Room" },
          { id: "state", header: "State" },
          { id: "actions", header: "", className: "text-right" },
        ]}
        rows={(slots ?? []).map((s) => {
          const section = `${s.sections?.courses?.code}-${s.sections?.section_no}`;
          return {
            id: s.id,
            search: `${section} ${weekdayLabel(s.weekday)}`,
            sort: { day: s.weekday, time: s.start_time, section },
            cells: {
              day: weekdayLabel(s.weekday),
              time: `${hhmm(s.start_time)}–${hhmm(s.end_time)}`,
              section: `${section} (${s.sections?.semesters?.name ?? ""})`,
              room: s.rooms?.code ?? s.sections?.rooms?.code ?? "—",
              state: s.is_active ? <Pill tone="green">active</Pill> : <Pill>paused</Pill>,
              actions: (
                <span className="inline-flex gap-1">
                  <RowAction action={toggleSlot} fields={{ id: s.id, is_active: String(!s.is_active) }} label={s.is_active ? "Pause" : "Enable"} />
                  <RowAction action={deleteSlot} fields={{ id: s.id }} label="Delete" variant="destructive" confirm="Delete this slot?" />
                </span>
              ),
            },
          };
        })}
      />
    </>
  );
}
