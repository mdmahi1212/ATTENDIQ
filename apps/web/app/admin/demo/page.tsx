import { Clapperboard, MonitorPlay, Video } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/app-shell";
import { Empty, LiveDot, Panel } from "@/components/dash";
import { RowAction } from "@/components/form";
import { StateBadge } from "@/components/state-badge";
import { DEMO_LENGTHS, demoPolicy, describeDemo, fullClassMinutes } from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";
import { fmtSeoul, seoulToday } from "@/lib/time";
import { startDemoClass } from "./actions";

export const metadata = { title: "Demo" };

const VIDEO_CMD = "powershell -ExecutionPolicy Bypass -File scripts\\run-video-demo.ps1 -Door <door.mp4> -Room <room.mp4>";

export default async function DemoPage() {
  const supabase = await createClient();
  const [{ data: sections }, { data: live }] = await Promise.all([
    supabase
      .from("sections")
      .select("id, section_no, courses(code, title), rooms(code), enrollments(count), timetable_slots(start_time, end_time)")
      .order("section_no"),
    supabase
      .from("class_sessions")
      .select("id, state, starts_at, ends_at, policy, sections(section_no, courses(code)), rooms(code)")
      .eq("session_date", seoulToday())
      .eq("is_makeup", true)
      .eq("is_simulation", false)
      .in("state", ["live", "recheck"])
      .order("starts_at", { ascending: false }),
  ]);
  const rows = (sections ?? []).sort((a, b) => `${a.courses?.code}${a.section_no}`.localeCompare(`${b.courses?.code}${b.section_no}`));

  return (
    <>
      <PageHeader title="Demo" description="Start a real class on a short clock to show every rule in a few minutes: live with phone cameras, or with two recorded videos." />

      <Panel title="Running now" className="mb-4" action={live?.length ? <LiveDot /> : undefined}>
        {!live?.length ? (
          <Empty>No demo class is running.</Empty>
        ) : (
          <ul className="divide-y">
            {live.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                <span className="font-medium">{s.sections?.courses?.code}-{s.sections?.section_no}</span>
                <span className="text-muted-foreground tabular-nums">
                  {fmtSeoul(s.starts_at, "HH:mm")}–{fmtSeoul(s.ends_at, "HH:mm")} · room {s.rooms?.code ?? "—"}
                </span>
                <StateBadge state={s.state} />
                <span className="ml-auto flex gap-2">
                  <Link href={`/sessions/${s.id}`} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">Open class</Link>
                  <Link href={`/sessions/${s.id}/dashboard`} className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted">Live dashboard</Link>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Panel title="Start a demo class">
          {rows.length === 0 && <Empty>No sections yet.</Empty>}
          <ul className="space-y-3">
            {rows.map((s) => {
              const full = fullClassMinutes(s.timetable_slots);
              return (
                <li key={s.id} className="rounded-2xl border p-4" data-testid="demo-section">
                  <p className="font-semibold">
                    {s.courses?.code}-{s.section_no} <span className="font-normal text-muted-foreground">· {s.courses?.title}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    room {s.rooms?.code ?? "—"} · {s.enrollments[0]?.count ?? 0} enrolled
                  </p>
                  {s.rooms ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {DEMO_LENGTHS.map((m) => (
                        <RowAction
                          key={m}
                          action={startDemoClass}
                          fields={{ id: s.id, length: String(m) }}
                          label={`${m} min`}
                          variant={m === 10 ? "default" : "outline"}
                          confirm={`Start a real ${m}-minute demo class now (${describeDemo(m)})? Enrolled students who are not seen end absent.`}
                        />
                      ))}
                      <RowAction
                        action={startDemoClass}
                        fields={{ id: s.id, length: "full" }}
                        label={`Full class (${full} min)`}
                        variant="outline"
                        confirm={`Start a real ${full}-minute class now with the normal rules? Enrolled students who are not seen end absent.`}
                      />
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-amber-700">Give this section a room first (Sections).</p>
                  )}
                </li>
              );
            })}
          </ul>
        </Panel>

        <div className="space-y-4">
          <Panel title="Demo timing (minutes from the start)">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr><th className="py-1 pr-2 font-medium">Rule</th>{DEMO_LENGTHS.map((m) => <th key={m} className="whitespace-nowrap px-2 py-1 font-medium tabular-nums">{m} min</th>)}<th className="px-2 py-1 font-medium">Full</th></tr>
                </thead>
                <tbody className="divide-y tabular-nums">
                  {(
                    [
                      ["Present until", (m: number) => demoPolicy(m).present_until_min, "10"],
                      ["Late until", (m: number) => demoPolicy(m).late_until_min, "30"],
                      ["Door marks until (17%)", (m: number) => Math.round(m * 17) / 100, "12.75"],
                      ["Count check every", (m: number) => demoPolicy(m).mismatch_interval_min, "5"],
                      ["Professor alert at", (m: number) => m - demoPolicy(m).recheck_before_end_min, "end − 5"],
                    ] as const
                  ).map(([label, f, full]) => (
                    <tr key={label}><td className="py-1.5 pr-2">{label}</td>{DEMO_LENGTHS.map((m) => <td key={m} className="px-2">{f(m)}</td>)}<td className="px-2">{full}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">At the end: anyone who walked out and never came back is absent; anyone never seen is absent.</p>
          </Panel>

          <Panel title="How to run it">
            <ol className="space-y-3 text-sm">
              <li className="flex gap-3"><Video className="mt-0.5 size-4 shrink-0 text-primary" /><span><b>Live phones:</b> start the classroom stack on the laptop, then press a length. People walk in front of phone 1 (door) and phone 2 (inside).</span></li>
              <li className="flex gap-3"><Clapperboard className="mt-0.5 size-4 shrink-0 text-primary" /><span><b>Recorded videos:</b> run on the laptop, then press a length that covers the videos. Both recordings start together the moment the class goes live.<code className="mt-1 block break-all rounded-lg bg-muted px-2 py-1 text-xs">{VIDEO_CMD}</code></span></li>
              <li className="flex gap-3"><MonitorPlay className="mt-0.5 size-4 shrink-0 text-primary" /><span>On screen: the live camera view <code className="rounded bg-muted px-1 text-xs">http://127.0.0.1:8090</code> and the class&apos;s <b>Live dashboard</b>.</span></li>
            </ol>
          </Panel>
        </div>
      </div>
    </>
  );
}
