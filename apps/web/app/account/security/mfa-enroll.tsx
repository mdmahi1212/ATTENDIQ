"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

type Pending = { factorId: string; qr: string; secret: string };

/** Supabase Auth TOTP: enroll -> scan QR -> challengeAndVerify with the 6-digit code. */
export function MfaEnroll({ initial }: { initial: { id: string; name?: string }[] }) {
  const supabase = createClient();
  const [verified, setVerified] = useState<{ id: string; name?: string }[]>(initial);
  const [pending, setPending] = useState<Pending | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) return toast.error(error.message);
    setVerified(data.totp.map((f) => ({ id: f.id, name: f.friendly_name })));
  }

  async function start() {
    setBusy(true);
    // Remove stale unverified factors first (an abandoned enrolment blocks a new one with the same name).
    const { data: list } = await supabase.auth.mfa.listFactors();
    for (const f of list?.all ?? []) if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
    // Friendly names must be unique among the user's factors.
    const taken = new Set(verified.map((f) => f.name));
    let n = verified.length + 1;
    while (taken.has(`Authenticator ${n}`)) n += 1;
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Authenticator ${n}` });
    setBusy(false);
    if (error) return toast.error(error.message);
    setPending({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }

  async function verify() {
    if (!pending) return;
    setBusy(true);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: pending.factorId, code: code.trim() });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Two-factor authentication is on.");
    setPending(null);
    setCode("");
    void refresh();
  }

  async function remove(id: string) {
    const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
    if (error) return toast.error(error.message);
    toast.success("Factor removed.");
    void refresh();
  }

  return (
    <div className="space-y-4 text-sm">
      {verified.length > 0 ? (
        <ul className="space-y-1">
          {verified.map((f) => (
            <li key={f.id} className="flex items-center justify-between">
              <span>✅ {f.name ?? "Authenticator app"}</span>
              <Button size="xs" variant="ghost" onClick={() => remove(f.id)}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p>No authenticator enrolled yet.</p>
      )}
      {!pending ? (
        <Button onClick={start} disabled={busy}>
          {verified.length ? "Add another authenticator" : "Set up authenticator app"}
        </Button>
      ) : (
        <div className="space-y-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- data: URI SVG from Supabase */}
          <img src={pending.qr} alt="Scan this QR code with your authenticator app" className="mx-auto size-44 rounded border bg-white p-2" />
          <p className="text-xs text-muted-foreground">
            Can&apos;t scan? Enter this secret: <code className="break-all">{pending.secret}</code>
          </p>
          <div className="grid gap-1.5">
            <Label htmlFor="totp">6-digit code</Label>
            <Input id="totp" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} maxLength={6} />
          </div>
          <Button onClick={verify} disabled={busy || code.trim().length !== 6}>
            Verify and turn on
          </Button>
        </div>
      )}
    </div>
  );
}
