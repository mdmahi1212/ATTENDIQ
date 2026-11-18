"use client";

import { ActionForm, SubmitButton } from "@/components/form";
import { decideAppeal } from "../actions";

export function DecideForm({ appealId }: { appealId: string }) {
  return (
    <ActionForm action={decideAppeal} className="flex flex-wrap items-center gap-2">
      {(state) => (
        <>
          <input type="hidden" name="appeal_id" value={appealId} />
          <input name="note" required minLength={3} maxLength={500} placeholder="Note to the student (required)" aria-label="Decision note" className="h-8 w-64 rounded-md border px-2 text-sm" />
          <select name="decision" defaultValue="approve" aria-label="Decision" className="h-8 rounded-md border px-1 text-sm">
            <option value="approve">Approve</option>
            <option value="reject">Reject</option>
          </select>
          <SubmitButton size="sm">Decide</SubmitButton>
          {state.fieldErrors?.note && <span className="text-xs text-destructive">{state.fieldErrors.note[0]}</span>}
        </>
      )}
    </ActionForm>
  );
}
