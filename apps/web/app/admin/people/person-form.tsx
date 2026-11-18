"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initialActionState } from "@/lib/action-state";
import { ASSIGNABLE_ROLES, personSchema } from "@/lib/validation";
import { createPersonAction } from "./actions";
import { OneTimeLink } from "./one-time-link";

type In = z.input<typeof personSchema>;
type Out = z.output<typeof personSchema>;

/** react-hook-form + zod for instant client feedback; the Server Action validates again. */
export function PersonForm({ departments }: { departments: { value: string; label: string }[] }) {
  const [pending, start] = useTransition();
  const [link, setLink] = useState<{ email: string; link: string } | null>(null);
  const form = useForm<In, unknown, Out>({
    resolver: zodResolver(personSchema),
    defaultValues: { email: "", full_name: "", role: "student", student_no: "", department_id: "" },
  });
  const err = form.formState.errors;

  const onSubmit = form.handleSubmit((values) => {
    const fd = new FormData();
    Object.entries(values).forEach(([k, v]) => v !== undefined && fd.set(k, String(v)));
    start(async () => {
      const res = await createPersonAction(initialActionState, fd);
      if (res.ok) {
        toast.success(res.message);
        form.reset();
        if (res.data?.link) setLink({ email: res.data.email, link: res.data.link });
      } else {
        toast.error(res.message);
      }
    });
  });

  return (
    <div className="mb-6 space-y-3 rounded-lg border p-4">
      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3" noValidate>
        <div className="grid gap-1.5">
          <Label htmlFor="p-email">Email</Label>
          <Input id="p-email" type="email" {...form.register("email")} aria-invalid={!!err.email} />
          {err.email && <p className="text-xs text-destructive">{err.email.message}</p>}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="p-name">Full name</Label>
          <Input id="p-name" {...form.register("full_name")} aria-invalid={!!err.full_name} />
          {err.full_name && <p className="text-xs text-destructive">{err.full_name.message}</p>}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="p-role">Role</Label>
          <select id="p-role" {...form.register("role")} className="h-8 rounded-lg border px-2 text-sm">
            {ASSIGNABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="p-no">Student no.</Label>
          <Input id="p-no" {...form.register("student_no")} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="p-dept">Department</Label>
          <select id="p-dept" {...form.register("department_id")} className="h-8 rounded-lg border px-2 text-sm">
            <option value="">—</option>
            {departments.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create person"}
        </Button>
      </form>
      {link && <OneTimeLink email={link.email} link={link.link} onClose={() => setLink(null)} />}
    </div>
  );
}
