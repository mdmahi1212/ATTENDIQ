"use client";

import { signIn } from "@/app/auth/actions";
import { ActionForm, SubmitButton, TextField } from "@/components/form";

export function LoginForm({ next }: { next?: string }) {
  return (
    <ActionForm action={signIn} resetOnSuccess={false} className="grid gap-4">
      {(state) => (
        <>
          {next && <input type="hidden" name="next" value={next} />}
          <TextField name="email" label="Email" type="email" autoComplete="email" required state={state} />
          <TextField name="password" label="Password" type="password" autoComplete="current-password" required state={state} />
          <SubmitButton>Sign in</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}
