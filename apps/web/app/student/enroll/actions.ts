"use server";

import { revalidatePath } from "next/cache";
import { assertRole } from "@/lib/auth";
import { CONSENT_VERSION } from "@/lib/consent";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type ConsentState = { ok: boolean; message: string } | null;

/** Records biometric consent for the current consent version (RLS: own row only). */
export async function giveConsent(): Promise<ConsentState> {
  const user = await assertRole("student");
  const supabase = await createClient();
  const { error } = await supabase
    .from("biometric_consents")
    .upsert({ student_id: user.id, version: CONSENT_VERSION, accepted_at: new Date().toISOString(), withdrawn_at: null }, { onConflict: "student_id,version" });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/student/enroll");
  return { ok: true, message: "Consent recorded." };
}

/**
 * Withdraw consent: marks it withdrawn, deletes every face embedding and clears the template.
 * Service role for the face tables (students cannot write them); the student is the audit actor via the trigger.
 */
export async function withdrawConsent(): Promise<ConsentState> {
  const user = await assertRole("student");
  const supabase = await createClient();
  const { error } = await supabase.from("biometric_consents").update({ withdrawn_at: new Date().toISOString() }).eq("student_id", user.id).is("withdrawn_at", null);
  if (error) return { ok: false, message: error.message };
  const admin = createAdminClient();
  const del = await admin.from("face_embeddings").delete().eq("student_id", user.id);
  if (del.error) return { ok: false, message: del.error.message };
  const upd = await admin
    .from("face_profiles")
    .update({ status: "deleted", template: null, review_note: "consent withdrawn by student", updated_at: new Date().toISOString() })
    .eq("student_id", user.id);
  if (upd.error) return { ok: false, message: upd.error.message };
  await admin.storage.from("face-review").remove([`${user.id}.jpg`]);
  revalidatePath("/student/enroll");
  return { ok: true, message: "Consent withdrawn. Your face data was deleted." };
}
