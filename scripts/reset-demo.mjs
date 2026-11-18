// Calls public.reset_demo() with the service role from apps/web/.env.local (dev laptop only).
// Deletes simulation + ad-hoc (non-timetable) sessions and everything attached; keeps people, faces, timetable.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const web = join(dirname(fileURLToPath(import.meta.url)), "..", "apps", "web");
const require = createRequire(join(web, "package.json"));
const { createClient } = require("@supabase/supabase-js");
const env = {};
for (const line of readFileSync(join(web, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("apps/web/.env.local needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data, error } = await admin.rpc("reset_demo");
if (error) {
  console.error("reset failed:", error.message);
  process.exit(1);
}
console.log("demo reset:", JSON.stringify(data));
