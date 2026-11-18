"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ActionForm, SelectField, SubmitButton } from "@/components/form";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { fileAppeal } from "../actions";

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "application/pdf"];

/**
 * The optional file goes straight from the browser to the private `appeal-files` bucket, into the student's
 * own folder (storage RLS enforces it). The Server Action then files the appeal with that path.
 */
export function AppealForm({ sessionId, userId }: { sessionId: string; userId: string }) {
  const router = useRouter();
  const [path, setPath] = useState("");
  const [fileMsg, setFileMsg] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const upload = async (file: File | undefined) => {
    setPath("");
    if (!file) return setFileMsg(null);
    if (!TYPES.includes(file.type)) return setFileMsg("Only JPEG, PNG or PDF.");
    if (file.size > MAX_BYTES) return setFileMsg("Max 5 MB.");
    setUploading(true);
    setFileMsg("Uploading…");
    const ext = file.type === "application/pdf" ? "pdf" : file.type === "image/png" ? "png" : "jpg";
    const key = `${userId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await createClient().storage.from("appeal-files").upload(key, file, { contentType: file.type, upsert: false });
    setUploading(false);
    if (error) {
      setFileMsg(`Upload failed: ${error.message}`);
      if (input.current) input.current.value = "";
      return;
    }
    setPath(key);
    setFileMsg(`Attached: ${file.name}`);
  };

  return (
    <ActionForm action={fileAppeal} className="max-w-lg space-y-4" onSuccess={() => router.push("/student/attendance")}>
      {(state) => (
        <>
          <input type="hidden" name="session_id" value={sessionId} />
          <input type="hidden" name="attachment_path" value={path} />
          <SelectField
            name="requested_status"
            label="I am asking for"
            state={state}
            defaultValue="excused"
            options={[
              { value: "excused", label: "Excused (illness, official event…)" },
              { value: "present", label: "Present (I was there, the system missed me)" },
              { value: "late", label: "Late (I came in late, not absent)" },
            ]}
          />
          <div className="grid gap-1.5">
            <Label htmlFor="reason">Reason</Label>
            <textarea id="reason" name="reason" required minLength={10} maxLength={2000} rows={5} className="rounded-lg border p-2 text-sm" placeholder="What happened? (at least 10 characters)" />
            {state.fieldErrors?.reason && <p className="text-xs text-destructive">{state.fieldErrors.reason[0]}</p>}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="file">Evidence (optional: medical note, photo; JPEG/PNG/PDF, max 5 MB)</Label>
            <input id="file" ref={input} type="file" accept={TYPES.join(",")} onChange={(e) => void upload(e.target.files?.[0])} className="text-sm" />
            {fileMsg && <p className="text-xs text-muted-foreground">{fileMsg}</p>}
          </div>
          {uploading ? <p className="text-sm">Waiting for the upload…</p> : <SubmitButton>Send appeal</SubmitButton>}
        </>
      )}
    </ActionForm>
  );
}
