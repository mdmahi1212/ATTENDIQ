import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { adminClient, E2E } from "./supabase-admin";

/**
 * Creates (or resets) the two e2e accounts through the Auth admin API.
 * Passwords are generated once and stored in the gitignored apps/web/.env.local, never printed.
 */
export default async function globalSetup() {
  ensurePassword("E2E_ADMIN_PASSWORD");
  ensurePassword("E2E_STUDENT_PASSWORD");
  const admin = adminClient();
  await upsertUser(admin, E2E.adminEmail(), E2E.adminPassword(), "admin", "E2E Admin");
  await upsertUser(admin, E2E.studentEmail(), E2E.studentPassword(), "student", "E2E Student");
}

function ensurePassword(name: string) {
  if (process.env[name]) return;
  const value = randomBytes(18).toString("base64url");
  const file = ".env.local";
  const text = readFileSync(file, "utf8");
  // Replace an empty `NAME=` line if present, else append.
  if (new RegExp(`^${name}=\\s*$`, "m").test(text)) {
    writeFileSync(file, text.replace(new RegExp(`^${name}=\\s*$`, "m"), `${name}=${value}`));
  } else {
    appendFileSync(file, `\n${name}=${value}\n`);
  }
  process.env[name] = value;
}

async function upsertUser(
  admin: ReturnType<typeof adminClient>,
  email: string,
  password: string,
  role: "admin" | "student",
  fullName: string,
) {
  const { data: existing } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, {
      password,
      app_metadata: { role },
      ban_duration: "none",
    });
    if (error) throw error;
    await admin.from("profiles").update({ role, is_active: true, full_name: fullName }).eq("id", existing.id);
    return existing.id;
  }
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role },
    user_metadata: { full_name: fullName },
  });
  if (error) throw error;
  return data.user.id;
}
