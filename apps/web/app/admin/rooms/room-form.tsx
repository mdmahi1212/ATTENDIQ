"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { ActionForm, FieldError, SubmitButton, TextField } from "@/components/form";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { Ring } from "@/lib/geo";
import { saveRoom } from "./actions";

// Leaflet touches `window`, so the map only renders in the browser.
const GeofenceMap = dynamic(() => import("./geofence-map"), {
  ssr: false,
  loading: () => <div className="h-80 animate-pulse rounded-lg border bg-muted" />,
});

export type RoomValues = {
  id?: string;
  code: string;
  name: string | null;
  building: string | null;
  floor: number | null;
  max_gps_accuracy_m: number;
  require_qr: boolean;
  ring: Ring;
};

export function RoomForm({ room }: { room: RoomValues }) {
  const [ring, setRing] = useState<Ring>(room.ring);
  const [requireQr, setRequireQr] = useState(room.require_qr);
  return (
    <ActionForm action={saveRoom} resetOnSuccess={false} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      {(state) => (
        <>
          <div className="grid content-start gap-4">
            {room.id && <input type="hidden" name="id" value={room.id} />}
            <input type="hidden" name="geofence" value={ring.length ? JSON.stringify(ring) : ""} />
            <input type="hidden" name="require_qr" value={requireQr ? "on" : ""} />
            <TextField name="code" label="Room code" defaultValue={room.code} required state={state} placeholder="B204" />
            <TextField name="name" label="Name" defaultValue={room.name ?? ""} state={state} />
            <TextField name="building" label="Building" defaultValue={room.building ?? ""} state={state} />
            <TextField name="floor" label="Floor" type="number" defaultValue={room.floor ?? ""} state={state} />
            <TextField
              name="max_gps_accuracy_m"
              label="Max GPS accuracy (m)"
              type="number"
              defaultValue={room.max_gps_accuracy_m}
              state={state}
            />
            <div className="flex items-center gap-2">
              <Checkbox id="require_qr_box" checked={requireQr} onCheckedChange={(v) => setRequireQr(Boolean(v))} />
              <Label htmlFor="require_qr_box">Require the rotating room QR for self-verify</Label>
            </div>
            <SubmitButton>Save room</SubmitButton>
          </div>
          <div className="grid content-start gap-2">
            <Label>Geofence (classroom outline)</Label>
            <GeofenceMap ring={ring} onChange={setRing} />
            <FieldError state={state} name="geofence" />
          </div>
        </>
      )}
    </ActionForm>
  );
}
