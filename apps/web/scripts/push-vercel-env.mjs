// Pushes the web app's environment variables from apps/web/.env.local to the Vercel project,
// using the official Vercel CLI with YOUR login. Values go through stdin (never on the command line)
// and are never printed. Secrets are stored as Sensitive.
//
// Run from apps/web:
//   npx vercel@66.1.0 login                     (once; opens your browser)
//   node scripts/push-vercel-env.mjs
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const PROJECT = "attendiq";
const SCOPE = "mdmahi1212s-projects";
const PROD_URL = "https://attendiq-rho.vercel.app";
const CLI = "vercel@66.1.0";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

// [key, value, sensitive]
const vars = [
  ["NEXT_PUBLIC_SUPABASE_URL", env.NEXT_PUBLIC_SUPABASE_URL, false],
  ["NEXT_PUBLIC_SUPABASE_ANON_KEY", env.NEXT_PUBLIC_SUPABASE_ANON_KEY, false],
  ["NEXT_PUBLIC_APP_URL", PROD_URL, false], // not the localhost value from .env.local
  ["NEXT_PUBLIC_VAPID_PUBLIC_KEY", env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, false],
  ["VAPID_SUBJECT", PROD_URL, false], // app URL as the push contact, no personal email
  ["SUPABASE_SERVICE_ROLE_KEY", env.SUPABASE_SERVICE_ROLE_KEY, true],
  ["VAPID_PRIVATE_KEY", env.VAPID_PRIVATE_KEY, true],
  ["PUSH_WEBHOOK_SECRET", env.PUSH_WEBHOOK_SECRET, true],
  ["FACE_API_SECRET", env.FACE_API_SECRET, true], // FACE_API_URL is NOT pushed: production reads the tunnel URL from the DB
];

const missing = vars.filter(([, v]) => !v).map(([k]) => k);
if (missing.length) {
  console.error(`Missing in .env.local: ${missing.join(", ")}. Nothing was pushed.`);
  process.exit(1);
}

let failed = 0;
for (const [key, value, sensitive] of vars) {
  const args = [
    "--yes", CLI, "env", "add", key,
    "--environment", "production,preview",
    "--project", PROJECT, "--scope", SCOPE,
    "--force", "--yes",
    sensitive ? "--sensitive" : "--no-sensitive",
  ];
  const r = spawnSync("npx", args, { input: value, encoding: "utf8", shell: process.platform === "win32" });
  if (r.status === 0) {
    console.log(`ok    ${key}${sensitive ? " (sensitive)" : ""}`);
  } else {
    failed += 1;
    // Print the CLI's message but scrub the value in case it was echoed.
    const msg = `${r.stderr || ""}${r.stdout || ""}`.split(value).join("***").trim().split(/\r?\n/).slice(-3).join(" | ");
    console.log(`FAIL  ${key}: ${msg}`);
  }
}
console.log(failed ? `\n${failed} variable(s) failed.` : "\nAll ${vars.length} variables are set for Production and Preview. Now redeploy.");
process.exit(failed ? 1 : 0);
