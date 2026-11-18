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
    .select("id, kind, stream_url, roi, entry_line, snapshot_path, edge_devices(name, rooms(code))")
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
            : "Draw the seat area. People whose feet are outside it are not counted (door, podium, windows)."
        }
      />
      <CameraEditor
        cameraId={cam.id}
        kind={cam.kind as "gate" | "inside"}
        snapshotUrl={signed}
        initialRoi={parsePoints(cam.roi)}
        initialLine={parsePoints(cam.entry_line)}
      />
    </>
  );
}
