import Link from "next/link";
import { PageHeader } from "@/components/app-shell";
import { Pill } from "@/components/badges";
import { RowAction } from "@/components/form";
import { SimpleCreateForm } from "@/components/simple-create-form";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtPair, parseHeartbeat } from "@/lib/device-status";
import { deviceHealth } from "@/lib/status";
import { createClient } from "@/lib/supabase/server";
import { ageSeconds, fmtSeoul } from "@/lib/time";
import { addCamera, deleteCamera, setDeviceActive } from "./actions";
import { AutoRefresh } from "./auto-refresh";
import { CreateDeviceForm, RotateKeyButton } from "./device-key-forms";

export default async function OperatorPage() {
  const supabase = await createClient();
  const [{ data: devices }, { data: rooms }] = await Promise.all([
    supabase
      .from("edge_devices")
      .select("id, name, kind, is_active, last_seen, status, api_key_hash, rooms(code), cameras(id, kind, stream_url, roi, entry_line, snapshot_path)")
      .order("name"),
    supabase.from("rooms").select("id, code").order("code"),
  ]);
  const roomOptions = (rooms ?? []).map((r) => ({ value: r.id, label: r.code }));
  const now = new Date();

  return (
    <>
      <PageHeader title="Devices & health" description="Edge nodes, ingest workers and simulators. Health comes from heartbeats (every 15 s)." actions={<AutoRefresh seconds={15} />} />
      <CreateDeviceForm rooms={roomOptions} />
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Device</TableHead>
              <TableHead>Room</TableHead>
              <TableHead>Health</TableHead>
              <TableHead>Last heartbeat</TableHead>
              <TableHead>FPS</TableHead>
              <TableHead>Frame age</TableHead>
              <TableHead>Queue</TableHead>
              <TableHead>CPU</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(devices ?? []).map((d) => {
              const age = ageSeconds(d.last_seen, now);
              const health = d.is_active ? deviceHealth(age) : "offline";
              const hb = parseHeartbeat(d.status);
              return (
                <TableRow key={d.id} data-testid={`device-${d.name}`}>
                  <TableCell>
                    <div className="font-medium">{d.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {d.kind} · {d.api_key_hash ? "key set" : <span className="text-amber-700">no key</span>}
                      {!d.is_active && " · disabled"}
                    </div>
                  </TableCell>
                  <TableCell>{d.rooms?.code ?? "—"}</TableCell>
                  <TableCell>
                    <Pill tone={health === "online" ? "green" : health === "stale" ? "amber" : "red"}>{health}</Pill>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {fmtSeoul(d.last_seen, "MM-dd HH:mm:ss")}
                    {age !== null && <div className="text-xs text-muted-foreground">{age}s ago</div>}
                  </TableCell>
                  <TableCell className="text-xs">{fmtPair(hb.fps)}</TableCell>
                  <TableCell className="text-xs">{fmtPair(hb.frame_age_ms, " ms")}</TableCell>
                  <TableCell>{hb.outbox ?? "—"}</TableCell>
                  <TableCell>{hb.cpu !== undefined ? `${Math.round(hb.cpu)}%` : "—"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-wrap justify-end gap-1">
                      <RotateKeyButton id={d.id} name={d.name} />
                      <RowAction
                        action={setDeviceActive}
                        fields={{ id: d.id, active: String(!d.is_active) }}
                        label={d.is_active ? "Disable" : "Enable"}
                        variant={d.is_active ? "destructive" : "outline"}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <h2 className="mt-8 mb-3 font-semibold">Cameras</h2>
      <div className="grid gap-4 lg:grid-cols-2">
        {(devices ?? [])
          .filter((d) => d.kind === "edge")
          .map((d) => (
            <div key={d.id} className="space-y-2 rounded-lg border p-4">
              <h3 className="font-medium">{d.name}</h3>
              <ul className="space-y-1 text-sm">
                {d.cameras.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <Pill tone="blue">{c.kind}</Pill> <code className="text-xs">{c.stream_url ?? "—"}</code>{" "}
                      {c.roi ? <Pill tone="green">ROI</Pill> : <Pill tone="amber">no ROI</Pill>}{" "}
                      {c.kind === "gate" && (c.entry_line ? <Pill tone="green">line</Pill> : <Pill tone="amber">no line</Pill>)}
                    </span>
                    <span className="inline-flex gap-1">
                      <Link href={`/operator/cameras/${c.id}`} className="text-xs underline">
                        Edit ROI / line
                      </Link>
                      <RowAction action={deleteCamera} fields={{ id: c.id }} label="Remove" variant="ghost" confirm="Remove this camera?" />
                    </span>
                  </li>
                ))}
              </ul>
              <SimpleCreateForm
                action={addCamera}
                submit="Add camera"
                hidden={{ device_id: d.id }}
                fields={[
                  { name: "kind", label: "Kind", options: [{ value: "gate", label: "gate" }, { value: "inside", label: "inside" }] },
                  { name: "stream_url", label: "Stream (URL / index / file)", placeholder: "http://192.168.0.21:8080/video" },
                ]}
              />
            </div>
          ))}
      </div>
    </>
  );
}
