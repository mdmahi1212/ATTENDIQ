"use client";

import { Plus } from "lucide-react";
import { ActionForm, SelectField, SubmitButton, TextField } from "@/components/form";
import type { ActionState } from "@/lib/action-state";

export type SimpleField =
  | { name: string; label: string; type?: "text" | "date" | "time" | "number" | "email"; required?: boolean; defaultValue?: string; placeholder?: string }
  | { name: string; label: string; options: { value: string; label: string }[]; placeholder?: string; required?: boolean; defaultValue?: string };

/** A one-row create form for the many small admin tables. */
export function SimpleCreateForm({
  action,
  fields,
  submit,
  hidden,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  fields: SimpleField[];
  submit: string;
  hidden?: Record<string, string>;
}) {
  return (
    <ActionForm action={action} className="aiq-enter mb-6 rounded-2xl border bg-card p-4 shadow-sm md:p-5">
      {(state) => (
        <>
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <span className="grid size-6 place-items-center rounded-lg bg-primary/10 text-primary">
              <Plus className="size-3.5" />
            </span>
            {submit}
          </p>
          <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(11rem,1fr))]">
          {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          {fields.map((f) =>
            "options" in f ? (
              <SelectField
                key={f.name}
                name={f.name}
                label={f.label}
                options={f.options}
                placeholder={f.placeholder}
                required={f.required}
                defaultValue={f.defaultValue}
                state={state}
                className="min-w-0"
              />
            ) : (
              <TextField
                key={f.name}
                name={f.name}
                label={f.label}
                type={f.type ?? "text"}
                required={f.required}
                defaultValue={f.defaultValue}
                placeholder={f.placeholder}
                state={state}
                className="min-w-0"
              />
            ),
          )}
          <SubmitButton className="w-full sm:w-auto">{submit}</SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}
