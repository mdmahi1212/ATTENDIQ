"use client";

import { useMemo, useState } from "react";
import { ActionForm, SubmitButton, TextField } from "@/components/form";
import { Input } from "@/components/ui/input";
import { enrollStudents } from "./actions";

type Candidate = { id: string; label: string; search: string };

/** Search + tick students, then enroll them in one go. */
export function EnrollPicker({ sectionId, candidates, today }: { sectionId: string; candidates: Candidate[]; today: string }) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const shown = useMemo(
    () => candidates.filter((c) => c.search.toLowerCase().includes(q.toLowerCase())).slice(0, 200),
    [candidates, q],
  );
  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <ActionForm action={enrollStudents} onSuccess={() => setPicked(new Set())} className="space-y-3 rounded-lg border p-4">
      {(state) => (
        <>
          <h2 className="font-medium">Enroll students</h2>
          <input type="hidden" name="section_id" value={sectionId} />
          {[...picked].map((id) => (
            <input key={id} type="hidden" name="student_ids" value={id} />
          ))}
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter students…" aria-label="Filter students" />
          <div className="max-h-56 space-y-1 overflow-auto rounded-md border p-2 text-sm">
            {shown.length === 0 && <p className="text-muted-foreground">No students to add.</p>}
            {shown.map((c) => (
              <label key={c.id} className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} />
                {c.label}
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <TextField name="starts_on" label="From" type="date" defaultValue={today} state={state} />
            <SubmitButton>Enroll {picked.size || ""}</SubmitButton>
          </div>
          {state.fieldErrors?.student_ids && <p className="text-xs text-destructive">{state.fieldErrors.student_ids[0]}</p>}
        </>
      )}
    </ActionForm>
  );
}
