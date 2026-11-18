import Link from "next/link";
import { PageHeader } from "@/components/app-shell";
import { Pill } from "@/components/badges";
import { DataTable } from "@/components/data-table";
import { RowAction } from "@/components/form";
import { buttonVariants } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { deleteRoom } from "./actions";

export default async function RoomsPage() {
  const supabase = await createClient();
  const [{ data: rooms }, { data: geo }] = await Promise.all([
    supabase.from("rooms").select("id, code, name, building, floor, require_qr, max_gps_accuracy_m, edge_devices(count)").order("code"),
    supabase.from("rooms_geo").select("id, geofence"),
  ]);
  const hasFence = new Set((geo ?? []).filter((g) => g.geofence).map((g) => g.id));
  return (
    <>
      <PageHeader
        title="Rooms"
        description="Classrooms with their GPS geofence and QR requirement."
        actions={
          <Link href="/admin/rooms/new" className={buttonVariants()}>
            New room
          </Link>
        }
      />
      <DataTable
        columns={[
          { id: "code", header: "Code", sortable: true },
          { id: "name", header: "Name" },
          { id: "where", header: "Building / floor" },
          { id: "geofence", header: "Geofence" },
          { id: "qr", header: "QR" },
          { id: "devices", header: "Devices" },
          { id: "actions", header: "", className: "text-right" },
        ]}
        rows={(rooms ?? []).map((r) => ({
          id: r.id,
          search: `${r.code} ${r.name ?? ""} ${r.building ?? ""}`,
          sort: { code: r.code },
          cells: {
            code: (
              <Link href={`/admin/rooms/${r.id}`} className="font-mono underline">
                {r.code}
              </Link>
            ),
            name: r.name ?? "—",
            where: `${r.building ?? "—"} / ${r.floor ?? "—"}`,
            geofence: hasFence.has(r.id) ? <Pill tone="green">drawn</Pill> : <Pill tone="amber">missing</Pill>,
            qr: r.require_qr ? "required" : "optional",
            devices: r.edge_devices[0]?.count ?? 0,
            actions: <RowAction action={deleteRoom} fields={{ id: r.id }} label="Delete" variant="destructive" confirm={`Delete room ${r.code}?`} />,
          },
        }))}
      />
    </>
  );
}
