import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app-shell";
import { Pill, SimBadge, StatusBadge } from "@/components/badges";
import { RowAction } from "@/components/form";
import { StateBadge } from "@/components/state-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth";
import { counters, mismatchText, type LiveStatus } from "@/lib/session-live";
import { deviceHealth } from "@/lib/status";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { ageSeconds, fmtSeoul } from "@/lib/time";
import { REASON_TEXT, type VerifyReason } from "@/lib/verify/decision";
import { policyNum } from "@/lib/verify/server";
import { endSession, sendVerifyRequest, startRecheck } from "./actions";
import { LiveRefresh } from "./live-refresh";
import { ManualMark } from "./manual-mark";

const METHOD_LABEL: Record<string, string> = { gate: "gate camera", self_verify: "self-verify", recheck: "recheck", manual: "manual", appeal: "appeal" };

export default async function LiveSessionPage({ params }: PageProps<"/sessions/[id]">) {
  await requireRole("professor", "admin");
  const { id } = await params;
  const supabase = await createClient();
  const { data: session } = await supabase
    .from("class_sessions")
    .select("id, state, starts_at, ends_at, staff_count, policy, gate_offline_seconds, is_simulation, room_id, sections(section_no, courses(code, title)), rooms(code)")
    .eq("id", id)
    .maybeSingle();
  if (!session) notFound(); // RLS: only staff of the section (or admin) can read it

  const [{ data: roster }, { data: occ }, { data: requests }] = await Promise.all([
    supabase
      .from("attendance")
      .select("student_id, status, method, first_seen_at, flags, note, profiles!attendance_student_id_fkey(full_name, student_no, is_simulated)")
      .eq("session_id", id),
    supabase.from("occupancy_samples").select("smoothed, stable, ts").eq("session_id", id).order("ts", { ascending: false }).limit(1),
    supabase
      .from("verification_requests")
      .select("id, kind, status, opens_at, closes_at, target_count, verification_targets(passed_at)")
      .eq("session_id", id)
      .order("opens_at", { ascending: false }),
  ]);
  const requestIds = (requests ?? []).map((r) => r.id);
  const [{ data: failed }, { data: devices }] = await Promise.all([
    requestIds.length
      ? supabase
          .from("verification_attempts")
          .select("student_id, reason, face_score, created_at")
          .in("request_id", requestIds)
          .eq("result", "fail")
          .order("created_at", { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] as { student_id: string; reason: string | null; face_score: number | null; created_at: string }[] }),
    // Device health is operator data; staff see it here only after RLS proved they can read the session.
    session.room_id
      ? createAdminClient().from("edge_devices").select("name, kind, last_seen, status").eq("room_id", session.room_id).eq("is_active", true)
      : Promise.resolve({ data: [] as { name: string; kind: string; last_seen: string | null; status: unknown }[] }),
  ]);

  const rows = (roster ?? []).sort((a, b) => (a.profiles?.full_name ?? "").localeCompare(b.profiles?.full_name ?? ""));
  const names = new Map(rows.map((r) => [r.student_id, r.profiles?.full_name ?? "?"]));
  const c = counters(
    rows.map((r) => r.status as LiveStatus),
    occ?.[0] ?? null,
    session.staff_count,
    policyNum(session.policy, "count_tolerance", 1),
  );
  const banner = mismatchText(c.mismatch);
  const live = session.state === "live" || session.state === "recheck";
  const openReq = (requests ?? []).filter((r) => r.status === "open");
  const reviewRows = rows.filter((r) => r.flags.includes("manual_check") || r.flags.includes("needs_review"));
  const title = `${session.sections?.courses?.code ?? "?"}-${session.sections?.section_no ?? ""} · room ${session.rooms?.code ?? "—"}`;

  return (
    <>
      <PageHeader
        title={title}
        description={`${session.sections?.courses?.title ?? ""} · ${fmtSeoul(session.starts_at, "yyyy-MM-dd HH:mm")}–${fmtSeoul(session.ends_at, "HH:mm")} (Seoul)`}
        actions={
          <span className="inline-flex items-center gap-2">
            {session.is_simulation && <SimBadge />}
            <StateBadge state={session.state} />
            {live && <LiveRefresh sessionId={id} />}
          </span>
        }
      />

      <div className="mb-4 grid grid-cols-3 gap-3">
        {[
          { label: "Verified (V)", value: c.verified, hint: "present + late" },
          { label: "Counted (C)", value: c.counted ?? "—", hint: occ?.[0] ? `${occ[0].stable ? "stable" : "settling"} · ${fmtSeoul(occ[0].ts, "HH:mm:ss")}` : "no inside camera data" },
          { label: "Enrolled", value: c.enrolled, hint: `${c.pending} pending` },
        ].map((k) => (
          <Card key={k.label}>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">{k.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-4xl font-semibold tabular-nums" data-testid={`counter-${k.label}`}>
                {k.value}
              </p>
              <p className="text-xs text-muted-foreground">{k.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {banner && (
        <div role="alert" className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {banner}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        {(devices ?? []).map((d) => {
          const h = deviceHealth(ageSeconds(d.last_seen));
          const st = (d.status ?? {}) as { fps?: Record<string, number>; frame_age_s?: Record<string, number | null> };
          const camAge = st.frame_age_s?.gate;
          const camOk = h === "online" && camAge !== null && camAge !== undefined && camAge < 10;
          return (
            <Pill key={d.name} tone={h === "online" ? (d.kind === "edge" && !camOk ? "amber" : "green") : h === "stale" ? "amber" : "red"}>
              {d.name}: {h}
              {d.kind === "edge" && h === "online" ? ` · gate cam ${camOk ? `${st.fps?.gate ?? 0} fps` : "offline"}` : ""}
            </Pill>
          );
        })}
        {session.gate_offline_seconds > 0 && <Pill tone="amber">gate camera was offline {Math.round(session.gate_offline_seconds / 60)} min</Pill>}
      </div>

      {live && (
        <div className="mb-6 flex flex-wrap gap-2">
          <RowAction action={sendVerifyRequest} fields={{ session_id: id }} label={`Send verify request (${c.pending} pending)`} variant="default" />
          <RowAction action={startRecheck} fields={{ session_id: id }} label="Start recheck" confirm="Ask every present/late student to confirm now? Non-verifiers become left early." />
          <Link href={`/sessions/${id}/qr`} target="_blank" className="inline-flex h-8 items-center rounded-lg border px-2.5 text-sm font-medium hover:bg-muted">
            Show room QR
          </Link>
          <RowAction action={endSession} fields={{ session_id: id }} label="End session" variant="destructive" confirm="End and finalize this session now? Pending students become absent if the devices were healthy." />
        </div>
      )}

      {openReq.length > 0 && (
        <div className="mb-6 rounded-lg border p-3 text-sm">
          <h2 className="mb-2 font-semibold">Open verification windows</h2>
          <ul className="space-y-1">
            {openReq.map((r) => (
              <li key={r.id}>
                <Pill tone={r.kind === "recheck" ? "amber" : "blue"}>{r.kind}</Pill> {r.verification_targets.filter((t) => t.passed_at).length}/{r.target_count} verified ·{" "}
                closes at {fmtSeoul(r.closes_at, "HH:mm:ss")}
              </li>
            ))}
          </ul>
        </div>
      )}

      <h2 className="mb-2 font-semibold">Roster ({rows.length})</h2>
      <div className="mb-6 overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Student</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">How</th>
              <th className="px-3 py-2">First seen</th>
              <th className="px-3 py-2">Markers</th>
              <th className="px-3 py-2 text-right" />
            </tr>
          </thead>
          <tbody className="divide-y" data-testid="roster">
            {rows.map((r) => (
              <tr key={r.student_id} data-student={r.student_id}>
                <td className="px-3 py-1.5">
                  <span className="inline-flex items-center gap-1.5">
                    {r.profiles?.full_name} {r.profiles?.is_simulated && <SimBadge />}
                  </span>
                  <span className="block text-xs text-muted-foreground">{r.profiles?.student_no ?? ""}</span>
                </td>
                <td className="px-3 py-1.5">
                  <StatusBadge status={r.status} />
                </td>
                <td className="px-3 py-1.5 text-xs">{r.method ? METHOD_LABEL[r.method] ?? r.method : "—"}</td>
                <td className="px-3 py-1.5 text-xs tabular-nums">{fmtSeoul(r.first_seen_at, "HH:mm:ss")}</td>
                <td className="px-3 py-1.5 text-xs">
                  <span className="inline-flex flex-wrap gap-1">
                    {r.flags.includes("gate_out") && <Pill tone="amber">went out</Pill>}
                    {r.flags.includes("reentry") && <Pill tone="blue">re-entered</Pill>}
                    {r.flags.includes("very_late") && <Pill tone="red">very late</Pill>}
                    {r.flags.includes("manual_check") && <Pill tone="amber">asks manual check</Pill>}
                    {r.flags.includes("needs_review") && <Pill tone="amber">needs review</Pill>}
                    {r.flags.includes("recheck_failed") && <Pill tone="red">recheck failed</Pill>}
                  </span>
                  {r.note && <span className="block text-muted-foreground">{r.note}</span>}
                </td>
                <td className="px-3 py-1.5 text-right">{session.state !== "locked" && session.state !== "cancelled" && <ManualMark sessionId={id} studentId={r.student_id} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mb-2 font-semibold">Review queue</h2>
      {(failed ?? []).length === 0 && reviewRows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing to review.</p>
      ) : (
        <ul className="divide-y rounded-lg border text-sm">
          {reviewRows.map((r) => (
            <li key={`flag-${r.student_id}`} className="px-3 py-2">
              <strong>{r.profiles?.full_name}</strong> — {r.flags.includes("manual_check") ? "asked for a manual check" : "pending after finalize (devices unhealthy)"}
            </li>
          ))}
          {(failed ?? []).map((f) => (
            <li key={`${f.student_id}-${f.created_at}`} className="px-3 py-2">
              <strong>{names.get(f.student_id) ?? "?"}</strong> failed self-verify at {fmtSeoul(f.created_at, "HH:mm:ss")}:{" "}
              {(f.reason ?? "")
                .split(",")
                .filter((x) => x && !x.startsWith("qr:"))
                .map((x) => REASON_TEXT[x as VerifyReason] ?? x)
                .join("; ") || "unknown"}
              {f.face_score !== null && <span className="text-muted-foreground"> (face {f.face_score.toFixed(2)})</span>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
