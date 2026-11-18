import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app-shell";
import { geoJsonToRing } from "@/lib/geo";
import { createClient } from "@/lib/supabase/server";
import { RoomForm, type RoomValues } from "../room-form";

export default async function RoomPage({ params }: PageProps<"/admin/rooms/[id]">) {
  const { id } = await params;
  if (id === "new") {
    const empty: RoomValues = { code: "", name: null, building: null, floor: null, max_gps_accuracy_m: 40, require_qr: true, ring: [] };
    return (
      <>
        <PageHeader title="New room" />
        <RoomForm room={empty} />
      </>
    );
  }
  const supabase = await createClient();
  const [{ data: room }, { data: geo }] = await Promise.all([
    supabase.from("rooms").select("id, code, name, building, floor, max_gps_accuracy_m, require_qr").eq("id", id).maybeSingle(),
    supabase.from("rooms_geo").select("geofence").eq("id", id).maybeSingle(),
  ]);
  if (!room) notFound();
  return (
    <>
      <PageHeader title={`Room ${room.code}`} description="Click on the map to outline the classroom. Students' GPS must overlap it (expanded by their accuracy)." />
      <RoomForm room={{ ...room, ring: geoJsonToRing(geo?.geofence) ?? [] }} />
    </>
  );
}
