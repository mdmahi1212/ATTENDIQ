"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

/** Second sign-in step for an already enrolled TOTP factor: raises the session to aal2. */
export function MfaVerify({ factorId, home }: { factorId: string; home: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    const { error } = await createClient().auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
    setBusy(false);
    if (error) return toast.error(error.message);
    router.replace(home);
    router.refresh();
  };
  return (
    <div className="space-y-2">
      <Label htmlFor="mfa-code">6-digit code from your authenticator app</Label>
      <Input id="mfa-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
      <Button onClick={submit} disabled={busy || code.length !== 6} className="w-full">
        Verify
      </Button>
    </div>
  );
}
