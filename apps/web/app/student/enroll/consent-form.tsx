"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { CONSENT_TEXT } from "@/lib/consent";
import { giveConsent, withdrawConsent, type ConsentState } from "./actions";

export function ConsentForm() {
  const [state, action, pending] = useActionState<ConsentState, FormData>(() => giveConsent(), null);
  return (
    <form action={action} className="space-y-3 rounded-lg border p-4 text-sm">
      <h2 className="font-semibold">{CONSENT_TEXT.title}</h2>
      {CONSENT_TEXT.paragraphs.map((p) => (
        <p key={p}>{p}</p>
      ))}
      <label className="flex items-start gap-2">
        <input type="checkbox" required className="mt-1" />
        <span>I have read this and I consent to the processing of my face data for attendance.</span>
      </label>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Saving…" : "I agree, continue"}
      </Button>
      {state && !state.ok && <p className="text-destructive">{state.message}</p>}
    </form>
  );
}

export function WithdrawConsent() {
  const [state, action, pending] = useActionState<ConsentState, FormData>(() => withdrawConsent(), null);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm("Withdraw consent and delete your face data? You will check in with QR + professor confirmation instead.")) e.preventDefault();
      }}
      className="text-sm"
    >
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        Withdraw consent and delete my face data
      </Button>
      {state && <p className={state.ok ? "mt-2 text-green-700" : "mt-2 text-destructive"}>{state.message}</p>}
    </form>
  );
}
