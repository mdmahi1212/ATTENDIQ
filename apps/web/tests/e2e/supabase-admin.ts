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
