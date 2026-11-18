import { z } from "zod";

/** Uniform result for Server Actions used with useActionState. */
export type ActionState = {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string[]>;
  /** One-time payload (e.g. a device key shown once). */
  data?: Record<string, string>;
};

export const initialActionState: ActionState = { ok: false, message: "" };

export function fromZodError(error: z.ZodError): ActionState {
  const flat = z.flattenError(error);
  return {
    ok: false,
    message: flat.formErrors[0] ?? "Please fix the highlighted fields.",
    fieldErrors: flat.fieldErrors as Record<string, string[]>,
  };
}

/** FormData -> plain object (last value wins; empty strings become undefined). */
export function formToObject(form: FormData): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") out[key] = value.trim() === "" ? undefined : value.trim();
  }
  return out;
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e && typeof e.message === "string") return e.message;
  return "Unexpected error";
}
