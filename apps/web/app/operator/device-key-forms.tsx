"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ActionForm, SelectField, SubmitButton, TextField } from "@/components/form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/action-state";
import { DEVICE_KINDS } from "@/lib/validation";
import { createDevice, rotateDeviceKey } from "./actions";

type Shown = { key: string; device_id: string; name: string };

function KeyOnce({ shown, onClose }: { shown: Shown; onClose: () => void }) {
  return (
    <Alert className="border-amber-300 bg-amber-50">
      <AlertTitle>API key for {shown.name} — shown only once</AlertTitle>
      <AlertDescription className="space-y-2">
        <p>Put it in the device .env (EDGE_DEVICE_KEY / INGEST_DEVICE_KEY / SIM_DEVICE_KEY). Only its SHA-256 is stored.</p>
        <p className="text-xs">Device id: <code>{shown.device_id}</code></p>
        <code className="block overflow-x-auto rounded bg-white p-2 text-xs" data-testid="device-key">
          {shown.key}
        </code>
        <div className="flex gap-2">
          <Button size="sm" type="button" onClick={() => navigator.clipboard.writeText(shown.key).then(() => toast.success("Copied"))}>
            Copy key
          </Button>
          <Button size="sm" variant="outline" type="button" onClick={onClose}>
            I saved it
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}

const pick = (s: ActionState): Shown | null =>
  s.data?.key ? { key: s.data.key, device_id: s.data.device_id, name: s.data.name } : null;

export function CreateDeviceForm({ rooms }: { rooms: { value: string; label: string }[] }) {
  const [shown, setShown] = useState<Shown | null>(null);
  return (
    <div className="mb-6 space-y-3">
      <ActionForm action={createDevice} onSuccess={(s) => setShown(pick(s))} className="flex flex-wrap items-end gap-3 rounded-lg border p-4">
        {(state) => (
          <>
            <TextField name="name" label="Device name" required placeholder="edge-B205" state={state} />
            <SelectField name="room_id" label="Room" options={rooms} placeholder="Choose…" required state={state} />
            <SelectField name="kind" label="Kind" options={DEVICE_KINDS.map((k) => ({ value: k, label: k }))} state={state} />
            <SubmitButton>Create device + key</SubmitButton>
          </>
        )}
      </ActionForm>
      {shown && <KeyOnce shown={shown} onClose={() => setShown(null)} />}
    </div>
  );
}

export function RotateKeyButton({ id, name }: { id: string; name: string }) {
  const [shown, setShown] = useState<Shown | null>(null);
  return (
    <>
      <ActionForm action={rotateDeviceKey} resetOnSuccess={false} onSuccess={(s) => setShown(pick(s))} className="inline">
        {() => (
          <>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="name" value={name} />
            <SubmitButton size="xs" variant="outline">
              Rotate key
            </SubmitButton>
          </>
        )}
      </ActionForm>
      {shown && (
        <div className="mt-2 w-full text-left">
          <KeyOnce shown={shown} onClose={() => setShown(null)} />
        </div>
      )}
    </>
  );
}
