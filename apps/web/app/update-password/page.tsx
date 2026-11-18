"use client";

import { updatePassword } from "@/app/auth/actions";
import { AuthCard } from "@/components/auth-card";
import { ActionForm, SubmitButton, TextField } from "@/components/form";

// Reached after a password-reset or "set your password" link (the link signs the user in first).
export default function UpdatePasswordPage() {
  return (
    <AuthCard title="Choose a new password">
      <ActionForm action={updatePassword} className="grid gap-4">
        {(state) => (
          <>
            <TextField name="password" label="New password (min 8)" type="password" autoComplete="new-password" required state={state} />
            <TextField name="confirm" label="Repeat password" type="password" autoComplete="new-password" required state={state} />
            <SubmitButton>Save password</SubmitButton>
          </>
        )}
      </ActionForm>
    </AuthCard>
  );
}
