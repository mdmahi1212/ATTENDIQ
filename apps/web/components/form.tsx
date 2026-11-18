"use client";

import { useActionState, useEffect, useRef, type ReactNode, type SelectHTMLAttributes } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { initialActionState, type ActionState } from "@/lib/action-state";

type Action = (prev: ActionState, form: FormData) => Promise<ActionState>;

/** Form bound to a Server Action: pending state, toast on result, field errors, optional reset. */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = true,
  onSuccess,
}: {
  action: Action;
  children: (state: ActionState) => ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  onSuccess?: (state: ActionState) => void;
}) {
  const [state, formAction] = useActionState(action, initialActionState);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!state.message) return;
    if (state.ok) {
      toast.success(state.message);
      if (resetOnSuccess) ref.current?.reset();
      onSuccess?.(state);
    } else {
      toast.error(state.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- react to each new result object only
  }, [state]);
  return (
    <form ref={ref} action={formAction} className={className}>
      {children(state)}
    </form>
  );
}

export function SubmitButton({ children, variant, size }: { children: ReactNode } & Pick<React.ComponentProps<typeof Button>, "variant" | "size">) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} variant={variant} size={size}>
      {pending ? "Saving…" : children}
    </Button>
  );
}

export function FieldError({ state, name }: { state: ActionState; name: string }) {
  const msg = state.fieldErrors?.[name]?.[0];
  return msg ? (
    <p className="text-xs text-destructive" id={`${name}-error`}>
      {msg}
    </p>
  ) : null;
}

export function TextField({
  name,
  label,
  state,
  className,
  ...props
}: { name: string; label: string; state: ActionState; className?: string } & React.ComponentProps<typeof Input>) {
  const invalid = Boolean(state.fieldErrors?.[name]);
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} aria-invalid={invalid || undefined} aria-describedby={invalid ? `${name}-error` : undefined} {...props} />
      <FieldError state={state} name={name} />
    </div>
  );
}

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive";

/** Native <select>: reliable with FormData in Server Actions. */
export function SelectField({
  name,
  label,
  state,
  options,
  placeholder,
  className,
  ...props
}: {
  name: string;
  label: string;
  state?: ActionState;
  options: { value: string; label: string }[];
  placeholder?: string;
  className?: string;
} & SelectHTMLAttributes<HTMLSelectElement>) {
  const invalid = Boolean(state?.fieldErrors?.[name]);
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={name}>{label}</Label>
      <select id={name} name={name} className={selectClass} aria-invalid={invalid || undefined} {...props}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {state && <FieldError state={state} name={name} />}
    </div>
  );
}

/** Small inline form for a single row action (delete, toggle…). */
export function RowAction({
  action,
  fields,
  label,
  variant = "outline",
  confirm,
}: {
  action: Action;
  fields: Record<string, string>;
  label: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  confirm?: string;
}) {
  return (
    <ActionForm action={action} resetOnSuccess={false} className="inline">
      {() => (
        <>
          {Object.entries(fields).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <ConfirmSubmit label={label} variant={variant} confirm={confirm} />
        </>
      )}
    </ActionForm>
  );
}

function ConfirmSubmit({
  label,
  variant,
  confirm,
}: {
  label: string;
  variant: React.ComponentProps<typeof Button>["variant"];
  confirm?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="xs"
      variant={variant}
      disabled={pending}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {pending ? "…" : label}
    </Button>
  );
}
