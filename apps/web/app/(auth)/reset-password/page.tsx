"use client";

import Link from "next/link";
import { requestPasswordReset } from "@/app/auth/actions";
import { AuthCard } from "@/components/auth-card";
import { ActionForm, SubmitButton, TextField } from "@/components/form";

export default function ResetPasswordPage() {
  return (
    <AuthCard
      title="Reset password"
      description="We will email you a link to choose a new password."
      footer={
        <Link href="/login" className="hover:underline">
          Back to sign in
        </Link>
      }
    >
      <ActionForm action={requestPasswordReset} className="grid gap-4">
        {(state) => (
          <>
            <TextField name="email" label="Email" type="email" autoComplete="email" required state={state} />
            <SubmitButton>Send reset link</SubmitButton>
          </>
        )}
      </ActionForm>
    </AuthCard>
  );
}
