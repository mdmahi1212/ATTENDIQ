"use client";

import Link from "next/link";
import { signUp } from "@/app/auth/actions";
import { AuthCard } from "@/components/auth-card";
import { ActionForm, SubmitButton, TextField } from "@/components/form";

export default function SignupPage() {
  return (
    <AuthCard
      title="Student sign up"
      description="Staff accounts are created by the university admin."
      footer={
        <Link href="/login" className="hover:underline">
          Already have an account? Sign in
        </Link>
      }
    >
      <ActionForm action={signUp} className="grid gap-4">
        {(state) => (
          <>
            <TextField name="full_name" label="Full name" autoComplete="name" required state={state} />
            <TextField name="student_no" label="Student number" state={state} />
            <TextField name="email" label="University email" type="email" autoComplete="email" required state={state} />
            <TextField name="password" label="Password (min 8)" type="password" autoComplete="new-password" required state={state} />
            <SubmitButton>Create account</SubmitButton>
          </>
        )}
      </ActionForm>
    </AuthCard>
  );
}
