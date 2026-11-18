"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/form";
import { Button } from "@/components/ui/button";
import { manualMark } from "./actions";

const STATUSES = ["present", "late", "absent", "excused", "left_early"] as const;

export function ManualMark({ sessionId, studentId }: { sessionId: string; studentId: string }) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <Button size="xs" variant="ghost" onClick={() => setOpen(true)}>
        Mark…
      </Button>
    );
  return (
    <ActionForm action={manualMark} onSuccess={() => setOpen(false)} className="flex flex-wrap items-center justify-end gap-1">
      {() => (
        <>
          <input type="hidden" name="session_id" value={sessionId} />
          <input type="hidden" name="student_id" value={studentId} />
          <select name="status" className="h-7 rounded-md border px-1 text-xs" defaultValue="present" aria-label="Status">
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <input name="reason" required minLength={3} maxLength={300} placeholder="Reason (required)" aria-label="Reason" className="h-7 w-40 rounded-md border px-2 text-xs" />
          <SubmitButton size="xs">Save</SubmitButton>
          <Button size="xs" variant="ghost" type="button" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </>
      )}
    </ActionForm>
  );
}
