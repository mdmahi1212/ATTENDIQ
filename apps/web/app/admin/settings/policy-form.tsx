"use client";

import { ActionForm, SelectField, SubmitButton, TextField } from "@/components/form";
import type { Policy } from "@/lib/validation";
import { fmtSeoul } from "@/lib/time";
import { savePolicy } from "./actions";

type NumKey = Exclude<keyof Policy, "left_early_counts_as" | "warn_attendance_pct">;

const GROUPS: { title: string; fields: { key: NumKey; label: string; step?: string }[] }[] = [
  {
    title: "Status timing (minutes after class start)",
    fields: [
      { key: "present_until_min", label: "Present until" },
      { key: "late_until_min", label: "Late until (then very late = absent)" },
      { key: "lock_after_hours", label: "Lock session after (hours)" },
      { key: "appeal_days", label: "Appeal window (days)" },
      { key: "late_weight", label: "Late counts as (0–1 of present)", step: "0.05" },
    ],
  },
  {
    title: "Mismatch & recheck",
    fields: [
      { key: "first_mismatch_check_min", label: "First mismatch check (min)" },
      { key: "mismatch_interval_min", label: "Check every (min)" },
      { key: "verify_window_min", label: "Verify window (min)" },
      { key: "recheck_before_end_min", label: "Recheck before end (min)" },
      { key: "recheck_window_min", label: "Recheck window (min)" },
      { key: "count_tolerance", label: "Count tolerance (people)" },
      { key: "stable_count_seconds", label: "Stable count after (s)" },
    ],
  },
  {
    title: "Recognition & verification",
    fields: [
      { key: "gate_accept_threshold", label: "Gate accept threshold", step: "0.01" },
      { key: "gate_min_margin", label: "Gate min margin", step: "0.01" },
      { key: "gate_min_votes", label: "Gate min votes" },
      { key: "verify_threshold", label: "Self-verify threshold", step: "0.01" },
      { key: "gps_max_accuracy_m", label: "Max GPS accuracy (m)" },
      { key: "qr_slot_seconds", label: "QR rotates every (s)" },
    ],
  },
];

export function PolicyForm({ policy, updatedAt }: { policy: Policy; updatedAt: string | null }) {
  return (
    <ActionForm action={savePolicy} resetOnSuccess={false} className="space-y-6">
      {(state) => (
        <>
          {GROUPS.map((g) => (
            <fieldset key={g.title} className="rounded-lg border p-4">
              <legend className="px-1 text-sm font-medium">{g.title}</legend>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {g.fields.map((f) => (
                  <TextField key={f.key} name={f.key} label={f.label} type="number" step={f.step ?? "1"} defaultValue={policy[f.key]} state={state} />
                ))}
              </div>
            </fieldset>
          ))}
          <fieldset className="rounded-lg border p-4">
            <legend className="px-1 text-sm font-medium">Policy outcomes</legend>
            <div className="grid gap-3 sm:grid-cols-3">
              <SelectField
                name="left_early_counts_as"
                label="Left early counts as"
                defaultValue={policy.left_early_counts_as}
                options={[
                  { value: "absent", label: "Absent" },
                  { value: "partial", label: "Partial (half)" },
                ]}
                state={state}
              />
              <TextField name="warn_high" label="First warning below (%)" type="number" defaultValue={policy.warn_attendance_pct[0]} state={state} />
              <TextField name="warn_low" label="Second warning below (%)" type="number" defaultValue={policy.warn_attendance_pct[1]} state={state} />
            </div>
          </fieldset>
          <div className="flex items-center gap-3">
            <SubmitButton>Save policy</SubmitButton>
            <span className="text-xs text-muted-foreground">Last saved {fmtSeoul(updatedAt)}</span>
          </div>
        </>
      )}
    </ActionForm>
  );
}
