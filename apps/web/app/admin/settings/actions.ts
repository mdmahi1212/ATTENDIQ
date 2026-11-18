"use server";

import { revalidatePath } from "next/cache";
import { assertRole } from "@/lib/auth";
import { dbMessage } from "@/lib/admin-action";
import { fromZodError, type ActionState } from "@/lib/action-state";
import { createClient } from "@/lib/supabase/server";
import { policySchema } from "@/lib/validation";

/** Saves the default policy. Running sessions keep the snapshot copied at their start. */
export async function savePolicy(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    await assertRole("admin");
  } catch {
    return { ok: false, message: "You are not allowed to do that." };
  }
  const raw: Record<string, unknown> = {};
  for (const [k, v] of form.entries()) {
    if (typeof v !== "string") continue;
    if (k === "left_early_counts_as") raw[k] = v;
    else if (k === "warn_high" || k === "warn_low") continue;
    else raw[k] = v === "" ? undefined : Number(v);
  }
  raw.warn_attendance_pct = [Number(form.get("warn_high")), Number(form.get("warn_low"))];
  const parsed = policySchema.safeParse(raw);
  if (!parsed.success) return fromZodError(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.from("settings").upsert({ key: "policy", value: parsed.data, updated_at: new Date().toISOString() });
  const msg = dbMessage(error);
  if (msg) return { ok: false, message: msg };
  revalidatePath("/admin/settings");
  return { ok: true, message: "Policy saved. It applies to sessions that start from now on." };
}
