import { Wifi } from "lucide-react";
import { ActionForm, RowAction, SubmitButton, TextField } from "@/components/form";
import { setCameraRotation, setCameraStream } from "../../actions";

/** Which phone this camera is: picked from the cameras the edge found on the Wi-Fi, typed, or automatic. */
export function CameraSource({ cameraId, kind, picked, rotate, status }: {
  cameraId: string;
  kind: "gate" | "inside";
  picked: string;
  rotate: number | null;
  status: { found: string[]; sources: Record<string, string>; online: Record<string, boolean | null> };
}) {
  const now = status.sources[kind] ?? "";
  const online = status.online[kind];
  return (
    <section className="mb-4 rounded-2xl border bg-card p-4 text-sm md:p-5" data-testid="camera-source">
      <h2 className="mb-1 flex items-center gap-2 font-semibold">
        <Wifi className="size-4 text-primary" /> Camera address
      </h2>
      <p className="text-muted-foreground">
        Now: {now ? <code className="rounded bg-muted px-1">{now}</code> : "none yet"}{" "}
        {online === true ? "· connected" : online === false ? "· not connected" : ""} ·{" "}
        {picked ? "chosen here" : "automatic (a camera the laptop finds on its Wi-Fi)"}
      </p>
      {status.found.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {status.found.map((u) => (
            <li key={u}>
              <RowAction
                action={setCameraStream}
                fields={{ camera_id: cameraId, stream_url: u }}
                label={`${u === picked ? "✓ " : ""}Use ${u.replace(/^https?:\/\//, "")}`}
                variant={u === picked ? "default" : "outline"}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          No phone camera found on the laptop&apos;s Wi-Fi yet: start the camera app on the phone (same Wi-Fi). The laptop
          searches every 2 minutes.
        </p>
      )}
      <ActionForm action={setCameraStream} className="mt-3 flex flex-wrap items-end gap-2" resetOnSuccess={false}>
        {(state) => (
          <>
            <input type="hidden" name="camera_id" value={cameraId} />
            <TextField name="stream_url" label="Or type the address the camera app shows" defaultValue={picked}
              placeholder="http://…:8080/video" state={state} className="min-w-64 flex-1" />
            <SubmitButton variant="outline">Save</SubmitButton>
          </>
        )}
      </ActionForm>
      <div className="mt-3 flex flex-wrap items-center gap-2" data-testid="camera-rotate">
        <span className="text-xs text-muted-foreground">Picture sideways or upside down? Turn it:</span>
        {[0, 90, 180, 270].map((r) => (
          <RowAction
            key={r}
            action={setCameraRotation}
            fields={{ camera_id: cameraId, rotate: String(r) }}
            label={`${rotate === r ? "✓ " : ""}${r}°`}
            variant={rotate === r ? "default" : "outline"}
          />
        ))}
        {rotate === null && <span className="text-xs text-muted-foreground">(now: the laptop&apos;s own setting)</span>}
      </div>
      {picked && (
        <div className="mt-2">
          <RowAction action={setCameraStream} fields={{ camera_id: cameraId, stream_url: "" }} label="Back to automatic" variant="ghost" />
        </div>
      )}
    </section>
  );
}
