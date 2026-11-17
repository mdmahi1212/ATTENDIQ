// SQL helper for the linked Supabase project (no Docker needed).
//   node scripts/db/run-sql.mjs tests          -> run supabase/tests/*.test.sql (each rolls itself back)
//   node scripts/db/run-sql.mjs replay         -> drop everything, replay migrations + seed, check, ROLLBACK
//   node scripts/db/run-sql.mjs exec "<sql>"   -> run one statement (used by new-device-key.ps1 -Apply)
// Connection: SUPABASE_DB_URL from the environment or the repo-root .env file.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function dbUrl() {
  if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL;
  const envFile = join(root, ".env");
  if (existsSync(envFile)) {
    for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*SUPABASE_DB_URL\s*=\s*(.+?)\s*$/);
      if (m) return m[1].replace(/^["']|["']$/g, "");
    }
  }
  throw new Error("SUPABASE_DB_URL is not set (environment or repo-root .env)");
}

const read = (...p) => readFileSync(join(root, ...p), "utf8");

// pg returns an array of results for multi-statement queries; take the last one with rows.
function lastRows(res) {
  const list = Array.isArray(res) ? res : [res];
  for (let i = list.length - 1; i >= 0; i--) if (list[i].rows?.length) return list[i].rows;
  return [];
}

async function withClient(fn) {
  const client = new pg.Client({ connectionString: dbUrl(), ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function runTests() {
  const dir = join(root, "supabase", "tests");
  const files = readdirSync(dir).filter((f) => f.endsWith(".test.sql")).sort();
  let failed = false;
  await withClient(async (c) => {
    for (const f of files) {
      const rows = lastRows(await c.query(read("supabase", "tests", f)));
      const tap = String(rows[0]?.tap ?? "");
      console.log(`# ${f}\n${tap}`);
      if (!tap || /^not ok/m.test(tap) || !/^1\.\.\d+/m.test(tap)) failed = true;
    }
  });
  if (failed) {
    console.error("SQL TESTS FAILED");
    process.exit(1);
  }
  console.log("ALL SQL TESTS PASSED");
}

async function runReplay() {
  const migDir = join(root, "supabase", "migrations");
  const migrations = readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort();
  const seed = read("supabase", "seed.sql")
    .split(/\r?\n/)
    .filter((l) => !/^\s*(begin|commit)\s*;\s*$/i.test(l)) // must stay inside OUR transaction
    .join("\n");
  const sql = [
    "begin;",
    read("supabase", "tests", "replay", "00_drop_all.sql"),
    ...migrations.map((m) => `-- ${m}\n` + read("supabase", "migrations", m)),
    seed,
    read("supabase", "tests", "replay", "99_check.sql"),
    "rollback;",
  ].join("\n");
  await withClient(async (c) => {
    const rows = lastRows(await c.query(sql));
    const r = rows[0]?.replay_result;
    console.log(JSON.stringify(r, null, 2));
    const ok =
      r && r.zero_state.tables_left === 0 && r.tables_without_rls.length === 0 &&
      r.seed_sim_students === 30 && r.cron_job && r.geofence_inside === true && r.geofence_far === false;
    if (!ok) {
      console.error("REPLAY CHECK FAILED");
      process.exit(1);
    }
    console.log(`REPLAY OK: ${migrations.length} migrations + seed applied from zero, then rolled back`);
  });
}

async function runExec(statement) {
  await withClient(async (c) => {
    const res = await c.query(statement);
    console.log(JSON.stringify(lastRows(res)));
  });
}

const [mode, arg] = process.argv.slice(2);
const modes = { tests: runTests, replay: runReplay, exec: () => runExec(arg) };
if (!modes[mode]) {
  console.error("usage: node scripts/db/run-sql.mjs tests | replay | exec \"<sql>\"");
  process.exit(2);
}
modes[mode]().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
