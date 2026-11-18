"use client";

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
    <ActionForm action={action} className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border p-4">
      {(state) => (
        <>
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
                className="min-w-44"
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
                className="min-w-40"
              />
            ),
          )}
          <SubmitButton>{submit}</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}
