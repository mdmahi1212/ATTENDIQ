// Generates a new push webhook secret and stores it in all three places that must agree:
//   1. apps/web/.env.local            (local dev)
//   2. Vercel env PUSH_WEBHOOK_SECRET (via the Vercel CLI, your login; value through stdin)
//   3. Supabase private.app_config    (via the service-role-only RPC set_push_webhook_secret)
// The secret is never printed. Redeploy Vercel afterwards so the new value is live.
//
// Run from apps/web (after `npx vercel@66.1.0 login`):  node scripts/rotate-webhook-secret.mjs
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const PROJECT = "attendiq";
const SCOPE = "mdmahi1212s-projects";
const FILE = ".env.local";

let text = readFileSync(FILE, "utf8");
const get = (k) => (text.match(new RegExp(`^${k}=(.*)$`, "m")) ?? [])[1]?.trim() ?? "";
const url = get("NEXT_PUBLIC_SUPABASE_URL");
const serviceKey = get("SUPABASE_SERVICE_ROLE_KEY");
if (!url || !serviceKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing in .env.local. Nothing changed.");
  process.exit(1);
}

const secret = randomBytes(32).toString("base64url"); // 43 chars

// 3 first: if the database refuses, nothing else changes.
const db = createClient(url, serviceKey, { auth: { persistSession: false } });
const { error } = await db.rpc("set_push_webhook_secret", { p_secret: secret });
if (error) {
  console.error(`FAIL  database: ${error.message}. Nothing changed.`);
  process.exit(1);
}
console.log("ok    database private.app_config.push_webhook_secret");

// 2
const r = spawnSync(
  "npx",
  ["--yes", "vercel@66.1.0", "env", "add", "PUSH_WEBHOOK_SECRET", "--environment", "production,preview",
   "--project", PROJECT, "--scope", SCOPE, "--force", "--yes", "--sensitive"],
  { input: secret, encoding: "utf8", shell: process.platform === "win32" },
);
if (r.status !== 0) {
  const msg = `${r.stderr || ""}${r.stdout || ""}`.split(secret).join("***").trim().split(/\r?\n/).slice(-3).join(" | ");
  console.error(`FAIL  vercel: ${msg}`);
  console.error("The database already has the NEW secret; rerun this script once the Vercel CLI works.");
  process.exit(1);
}
console.log("ok    vercel PUSH_WEBHOOK_SECRET (production, preview; sensitive)");

// 1
text = /^PUSH_WEBHOOK_SECRET=.*$/m.test(text)
  ? text.replace(/^PUSH_WEBHOOK_SECRET=.*$/m, `PUSH_WEBHOOK_SECRET=${secret}`)
  : `${text}\nPUSH_WEBHOOK_SECRET=${secret}\n`;
writeFileSync(FILE, text);
console.log("ok    .env.local");
console.log("\nDone. Redeploy production so the new secret is live.");
