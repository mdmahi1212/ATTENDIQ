import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app-shell";
import { createClient } from "@/lib/supabase/server";
import { parsePoints } from "@/lib/camera-geometry";
import { CameraEditor } from "./camera-editor";

export default async function CameraPage({ params }: PageProps<"/operator/cameras/[id]">) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: cam } = await supabase
    .from("cameras")
    .select("id, kind, stream_url, roi, entry_line, exit_line, door_point, snapshot_path, snapshot_at, edge_devices(name, rooms(code))")
    .eq("id", id)
    .maybeSingle();
  if (!cam) notFound();
  const signed = cam.snapshot_path
    ? (await supabase.storage.from("camera-snapshots").createSignedUrl(cam.snapshot_path, 600)).data?.signedUrl ?? null
    : null;
  return (
    <>
      <PageHeader
        title={`${cam.kind} camera · ${cam.edge_devices?.name ?? ""} (${cam.edge_devices?.rooms?.code ?? "—"})`}
        description={
          cam.kind === "gate"
            ? "Draw the doorway region and the entry line. Crossing the line toward the room = IN."
            : "Draw the seat area (only people whose feet are inside are counted), the exit line between the seats and the door, and click the door side. The edge applies it within a minute."
        }
      />
      <CameraEditor
        cameraId={cam.id}
        kind={cam.kind as "gate" | "inside"}
        snapshotUrl={signed}
        initialRoi={parsePoints(cam.roi)}
        initialLine={parsePoints(cam.entry_line)}
        initialExit={parsePoints(cam.exit_line)}
        initialDoor={parsePoints(cam.door_point ? [cam.door_point] : null)[0] ?? null}
        snapshotAt={cam.snapshot_at}
      />
    </>
  );
}
