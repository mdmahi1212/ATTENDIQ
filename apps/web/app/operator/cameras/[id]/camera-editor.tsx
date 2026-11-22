"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { initialActionState } from "@/lib/action-state";
import { normalise, type Pt } from "@/lib/camera-geometry";
import { createClient } from "@/lib/supabase/client";
import { saveCameraGeometry, setSnapshotPath } from "../../actions";

type Mode = "roi" | "line" | "exit" | "door";

export function CameraEditor({
  cameraId,
  kind,
  snapshotUrl,
  initialRoi,
  initialLine,
  initialExit,
  initialDoor,
  snapshotAt,
}: {
  cameraId: string;
  kind: "gate" | "inside";
  snapshotUrl: string | null;
  initialRoi: Pt[];
  initialLine: Pt[];
  initialExit: Pt[];
  initialDoor: Pt | null;
  snapshotAt: string | null;
}) {
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>("roi");
  const [roi, setRoi] = useState<Pt[]>(initialRoi);
  const [line, setLine] = useState<Pt[]>(initialLine);
  const [exit, setExit] = useState<Pt[]>(initialExit);
  const [door, setDoor] = useState<Pt | null>(initialDoor);
  const [pending, start] = useTransition();

  function onClick(e: React.MouseEvent<HTMLDivElement>) {
    const r = box.current!.getBoundingClientRect();
    const p = normalise(e.clientX - r.left, e.clientY - r.top, r.width, r.height);
    if (mode === "roi") setRoi((prev) => [...prev, p]);
    else if (mode === "line") setLine((prev) => (prev.length >= 2 ? [p] : [...prev, p]));
    else if (mode === "exit") setExit((prev) => (prev.length >= 2 ? [p] : [...prev, p]));
    else setDoor(p);
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `${cameraId}/snapshot-${Date.now()}.${ext}`;
    const { error } = await createClient().storage.from("camera-snapshots").upload(path, file, { contentType: file.type });
    if (error) return toast.error(error.message);
    const fd = new FormData();
    fd.set("camera_id", cameraId);
    fd.set("path", path);
    const res = await setSnapshotPath(initialActionState, fd);
    (res.ok ? toast.success : toast.error)(res.message);
    router.refresh();
  }

  function save() {
    const fd = new FormData();
    fd.set(
      "payload",
      JSON.stringify({
        camera_id: cameraId,
        roi: roi.length >= 3 ? roi : null,
        entry_line: line.length === 2 ? line : null,
        exit_line: exit.length === 2 ? exit : null,
        door_point: exit.length === 2 ? door : null,
      }),
    );
    start(async () => {
      const res = await saveCameraGeometry(initialActionState, fd);
      (res.ok ? toast.success : toast.error)(res.message);
    });
  }

  const pts = (ps: Pt[]) => ps.map(([x, y]) => `${x * 100},${y * 100}`).join(" ");

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div
        ref={box}
        onClick={onClick}
        className="relative aspect-video w-full cursor-crosshair overflow-hidden rounded-lg border bg-muted"
        role="application"
        aria-label="Click to add points"
      >
        {snapshotUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from private storage
          <img src={snapshotUrl} alt="Camera snapshot" className="absolute inset-0 h-full w-full object-fill" />
        ) : (
          <p className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">Upload a snapshot from this camera to draw on.</p>
        )}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
          {roi.length >= 2 && <polygon points={pts(roi)} fill="rgba(37,99,235,0.2)" stroke="#2563eb" strokeWidth={0.4} />}
          {roi.map(([x, y], i) => (
            <circle key={`r${i}`} cx={x * 100} cy={y * 100} r={0.8} fill="#2563eb" />
          ))}
          {line.length === 2 && <polyline points={pts(line)} stroke="#dc2626" strokeWidth={0.8} fill="none" />}
          {line.map(([x, y], i) => (
            <circle key={`l${i}`} cx={x * 100} cy={y * 100} r={1} fill="#dc2626" />
          ))}
          {exit.length === 2 && <polyline points={pts(exit)} stroke="#f59e0b" strokeWidth={0.9} fill="none" strokeDasharray="2 1" />}
          {exit.map(([x, y], i) => (
            <circle key={`e${i}`} cx={x * 100} cy={y * 100} r={1} fill="#f59e0b" />
          ))}
          {door && <circle cx={door[0] * 100} cy={door[1] * 100} r={1.6} fill="#16a34a" stroke="#fff" strokeWidth={0.4} />}
        </svg>
      </div>
      <div className="space-y-4 text-sm">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant={mode === "roi" ? "default" : "outline"} onClick={() => setMode("roi")}>
            {kind === "inside" ? "Seat area" : "Doorway area"} ({roi.length})
          </Button>
          {kind === "gate" && (
            <Button type="button" variant={mode === "line" ? "default" : "outline"} onClick={() => setMode("line")}>
              Entry line ({line.length}/2)
            </Button>
          )}
          {kind === "inside" && (
            <>
              <Button type="button" variant={mode === "exit" ? "default" : "outline"} onClick={() => setMode("exit")}>
                Exit line ({exit.length}/2)
              </Button>
              <Button type="button" variant={mode === "door" ? "default" : "outline"} onClick={() => setMode("door")}>
                Door side {door ? "✓" : ""}
              </Button>
            </>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {mode === "roi" && (kind === "inside" ? "Click around the seats: only people whose feet are inside are counted." : "Click around the doorway.")}
          {mode === "line" && "Click two points: the line people cross when they walk in."}
          {mode === "exit" && "Click two points: a line between the seats and the door. Crossing it toward the door = left."}
          {mode === "door" && "Click once on the door side of the exit line."}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => (mode === "roi" ? setRoi((r) => r.slice(0, -1)) : mode === "line" ? setLine((l) => l.slice(0, -1)) : mode === "exit" ? setExit((l) => l.slice(0, -1)) : setDoor(null))}>
            Undo
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => (mode === "roi" ? setRoi([]) : mode === "line" ? setLine([]) : mode === "exit" ? setExit([]) : setDoor(null))}>
            Clear
          </Button>
          <Button type="button" size="sm" onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Save geometry"}
          </Button>
        </div>
        <label className="grid gap-1">
          <span className="font-medium">Snapshot</span>
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => upload(e.target.files?.[0])} />
          <span className="text-xs text-muted-foreground">
            {snapshotAt ? `From the camera at ${new Date(snapshotAt).toLocaleTimeString()} (the edge sends a new one every 2 min while running). ` : "The edge uploads one by itself while it runs. "}
            Private; operators only. Refresh the page for the newest.
          </span>
        </label>
      </div>
    </div>
  );
}
