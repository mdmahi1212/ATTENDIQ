"use client";

import { useState } from "react";
import { ActionForm, RowAction, SubmitButton } from "@/components/form";
import { ASSIGNABLE_ROLES } from "@/lib/validation";
import type { Role } from "@/lib/roles";
import { changeRole, passwordLink, resetPhone, setActive } from "./actions";
import { OneTimeLink } from "./one-time-link";

export function PersonRowActions({ id, email, role, active, simulated, phone = null }: {
  id: string; email: string | null; role: Role; active: boolean; simulated: boolean; phone?: string | null;
}) {
  const [link, setLink] = useState<{ email: string; link: string } | null>(null);
  if (simulated) return <span className="text-xs text-muted-foreground">simulated</span>;
  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      <ActionForm action={changeRole} resetOnSuccess={false} className="inline-flex items-center gap-1">
        {() => (
          <>
            <input type="hidden" name="id" value={id} />
            <select name="role" defaultValue={role} aria-label="Role" className="h-6 rounded-md border px-1 text-xs">
              {ASSIGNABLE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <SubmitButton size="xs" variant="outline">
              Set
            </SubmitButton>
          </>
        )}
      </ActionForm>
      {phone && (
        <RowAction
          action={resetPhone}
          fields={{ id }}
          label={`Reset phone (${phone})`}
          variant="outline"
          confirm="Forget this student's registered phone? Their next self-verify registers the phone they use then."
        />
      )}
      <RowAction
        action={setActive}
        fields={{ id, active: String(!active) }}
        label={active ? "Deactivate" : "Activate"}
        variant={active ? "destructive" : "outline"}
        confirm={active ? "Block this account from signing in?" : undefined}
      />
      {email && (
        <ActionForm
          action={passwordLink}
          resetOnSuccess={false}
          className="inline"
          onSuccess={(s) => s.data?.link && setLink({ email: s.data.email, link: s.data.link })}
        >
          {() => (
            <>
              <input type="hidden" name="email" value={email} />
              <SubmitButton size="xs" variant="ghost">
                Password link
              </SubmitButton>
            </>
          )}
        </ActionForm>
      )}
      {link && (
        <div className="w-full">
          <OneTimeLink email={link.email} link={link.link} onClose={() => setLink(null)} />
        </div>
      )}
    </div>
  );
}
