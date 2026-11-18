import "server-only";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import type { z } from "zod";
import { assertRole, type CurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { errorMessage, fromZodError, formToObject, type ActionState } from "@/lib/action-state";
import type { Role } from "@/lib/roles";

type Supa = Awaited<ReturnType<typeof createClient>>;

/** Friendly text for common Postgres errors surfaced by PostgREST. */
export function dbMessage(error: { code?: string; message: string } | null | undefined): string | null {
  if (!error) return null;
  switch (error.code) {
    case "23505":
      return "That already exists.";
    case "23503":
      return "It is still referenced by other records.";
    case "23514":
      return "A value is out of the allowed range.";
    case "42501":
      return "You are not allowed to do that.";
    default:
      return error.message;
  }
}

/**
 * Wraps a Server Action: re-checks the caller's role (never trust proxy.ts alone),
 * validates the form with zod, runs the mutation as the signed-in user (RLS + audit triggers
 * see auth.uid()), and revalidates the given path.
 */
export function formAction<S extends z.ZodType>(opts: {
  roles: Role[];
  schema: S;
  revalidate: string | string[];
  run: (input: z.infer<S>, ctx: { supabase: Supa; user: CurrentUser; form: FormData }) => Promise<string | ActionState>;
}) {
  return async (_prev: ActionState, form: FormData): Promise<ActionState> => {
    let user: CurrentUser;
    try {
      user = await assertRole(...opts.roles);
    } catch {
      return { ok: false, message: "You are not allowed to do that." };
    }
    const parsed = opts.schema.safeParse(formToObject(form));
    if (!parsed.success) return fromZodError(parsed.error);
    try {
      const supabase = await createClient();
      const result = await opts.run(parsed.data, { supabase, user, form });
      for (const p of ([] as string[]).concat(opts.revalidate)) revalidatePath(p);
      return typeof result === "string" ? { ok: true, message: result } : result;
    } catch (e) {
      unstable_rethrow(e); // let redirect()/notFound() through
      return { ok: false, message: errorMessage(e) };
    }
  };
}

/** Throws a readable error when a Supabase call failed. */
export function check<T extends { error: { code?: string; message: string } | null }>(res: T): T {
  const msg = dbMessage(res.error);
  if (msg) throw new Error(msg);
  return res;
}
