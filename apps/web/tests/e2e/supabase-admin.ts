import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/database.types";

/** Service-role client for test setup/cleanup only (runs on the dev machine, never in the browser). */
export function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("E2E needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in apps/web/.env.local");
  }
  return createClient<Database>(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export const E2E = {
  adminEmail: () => process.env.E2E_ADMIN_EMAIL || "e2e-admin@attendance.test",
  studentEmail: () => process.env.E2E_STUDENT_EMAIL || "e2e-student@attendance.test",
  adminPassword: () => required("E2E_ADMIN_PASSWORD"),
  studentPassword: () => required("E2E_STUDENT_PASSWORD"),
};

function required(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} missing (global-setup writes it to .env.local)`);
  return v;
}

/**
 * A simulated student who exists only for one test (the live database keeps no simulated accounts): created,
 * enrolled in the section, and deleted afterwards with everything attached (enrollment, attendance).
 */
export async function tempSimStudent(admin: ReturnType<typeof adminClient>, sectionId: string, label: string) {
  const email = `e2e-sim-${crypto.randomUUID().slice(0, 8)}@attendance.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: crypto.randomUUID(),
    email_confirm: true,
    app_metadata: { role: "student" },
    user_metadata: { full_name: label },
  });
  if (error) throw error;
  const id = data.user.id;
  const today = new Date().toISOString().slice(0, 10);
  const upd = await admin.from("profiles").update({ is_simulated: true, full_name: label }).eq("id", id);
  if (upd.error) throw upd.error;
  const enr = await admin.from("enrollments").insert({ student_id: id, section_id: sectionId, starts_on: today });
  if (enr.error) throw enr.error;
  return { id, remove: async () => void (await admin.auth.admin.deleteUser(id)) };
}
