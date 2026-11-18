# PROGRESS

Last updated: 2026-11-18

## Phase status

| Phase | Status | Gate |
|---|---|---|
| 0 Preflight | DONE (commit b0295a4) | tools ✅, skeleton ✅, .env.example per app ✅ |
| 1 Database | DONE (commit 1a130c2) | see Gate 1 below |
| 2 Web foundation | DONE — waiting for "continue" | see Gate 2 below |
| 3 PWA + push + deploy | not started | |
| 4 Face API + enrollment | not started | |
| 5 Edge + MQTT + ingest + simulator | not started | |
| 6 Occupancy + live dashboard + self-verify | not started | |
| 7 Recheck, finalize, appeals, reports | not started | |
| 8 ESP32, hardening, docs | not started | |

## Gate 2 status (2026-11-18)

| Check | Result |
|---|---|
| `npm run lint` | ✅ 0 problems |
| `npm run typecheck` (`next typegen && tsc --noEmit`) | ✅ |
| `npm test` (Vitest) | ✅ 39/39 (roles/route guard, zod schemas, CSV preview, geofence + camera geometry, device keys, timetable clash, Seoul time, status colours, device health, audit diff, attendance %) |
| `npm run build` | ✅ 29 routes + proxy |
| Dev server smoke test (browser) | ✅ `/admin/people` signed out → `/login?next=/admin/people`; sign-in Server Action reaches Supabase Auth (wrong password → "Wrong email or password.") |
| Playwright e2e against the dev server | ✅ 5/5: signed-out → /login; student blocked from /admin, /admin/people, /operator; admin creates course → section → enrolls the e2e student (+ audit row by the admin); the student sees the section; screenshot capture |
| Screenshots → `docs/screenshots/` | ✅ 16 pages (admin portal + operator) |
| SQL tests after migration 07 | ✅ 93/93 (2 new: role follows a later app_metadata change; unknown role ignored) |

### Bug found by the e2e run (fixed)
The Auth admin API (`createUser`) inserts the user first and writes custom `app_metadata` afterwards, so the
insert trigger created a `student` profile for an admin account (JWT said admin, `profiles` said student →
`/forbidden`). Fixed at the root with migration 07 (`20261118003431_sync_role_from_app_metadata`): an
`after update of raw_app_meta_data` trigger on `auth.users` keeps `profiles.role` in sync (only the service
role can write app_metadata, so this is safe; unknown role strings are ignored; the change is audited).

### Phase 2 decisions
- **`proxy.ts` instead of `middleware.ts`**: Next 16 renamed the file convention (middleware is deprecated). Same job: refresh the Supabase session cookie + role redirect. Every layout, Server Action and Route Handler re-checks the role from `public.profiles` (`lib/auth.ts`).
- **`cacheComponents` turned off** (the 16.4 template enables it). All pages are per-user, RLS-scoped data; classic dynamic rendering is simpler.
- Proxy routes by the JWT `app_metadata.role`; admin role changes update both `profiles.role` and `app_metadata` (`lib/people.ts`).
- Admin writes go through the **user's** Supabase client (RLS + audit triggers record the admin as actor). The service-role client (`lib/supabase/admin.ts`, `server-only`) is used only for Auth admin calls (create user, ban, set-password link) and `notify_user`.
- New accounts get a **one-time set-password link** (recovery OTP via `auth.admin.generateLink`), shown once to the admin. No SMTP needed for staff accounts.
- Supabase key: the modern **publishable key** (`sb_publishable_…`) is used as `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- shadcn/ui preset `base-nova` (Base UI primitives). Form selects are native `<select>` for reliable `FormData`.
- TanStack Table **v9** (`useTable` + `tableFeatures`), wrapped in `components/data-table.tsx`: server pages pass pre-rendered cells plus plain sort/search values.
- Migration 06 (`20261117173003_rooms_geo_snapshots`): `rooms_geo` view (security_invoker) for GeoJSON + private `camera-snapshots` bucket with operator-only storage policies.
- Timetable: a room cannot host two overlapping slots in the same semester; enrollment skips students whose other sections clash.
- MFA: TOTP enrolment page at `/account/security` for admin + operator. **Enforcement** (require aal2) is Phase 8.

### Web versions (resolved 2026-11-18, locked in apps/web/package-lock.json)
next 16.4.6 · react 19.3.0 · typescript 5.9.3 · tailwindcss 4.3.3 · @supabase/ssr 0.12.7 · @supabase/supabase-js 2.119.0 · zod 4.6.7 ·
react-hook-form 7.92.0 · @hookform/resolvers 7.0.7 · @tanstack/react-table 9.3.1 · date-fns 4.4.0 · date-fns-tz 3.2.0 · papaparse 5.7.1 ·
leaflet 1.9.4 · react-leaflet 5.0.0 · sonner 2.0.8 · @base-ui/react 1.9.0 · shadcn 4.23.0 · lucide-react 1.74.0 · vitest 5.1.0 · vite 8.3.8 ·
@playwright/test 1.65.1 (Chromium headless shell 159) · eslint 9.39.5 · eslint-config-next 16.4.6 · @types/node 24.19.2 (template had ^20; Node 24 is installed and vitest needs ≥22 types)

## Gate 1 results (2026-11-18)

| Check | Result | How |
|---|---|---|
| Migrations apply cleanly from zero | ✅ PASS | Inside one transaction: dropped every object we create (0 tables / 0 functions / 0 extensions left), replayed all 5 migrations + seed, checked, rolled back. Result: 31 tables all with RLS, 52 policies, 38 functions, cron job, 4 Realtime tables, 32 profiles (30 SIM), geofence check true/false, a tick created + started a session. |
| All SQL tests pass | ✅ 91/91 | `supabase/tests/rule_engine.test.sql` (pgTAP, rolled back) — every edge case in the build prompt list, plus tick/holiday/lock, gallery, face match, finalize fail-safe, RLS |
| RLS: student JWT cannot read another student's attendance | ✅ PASS | tests 81–91 (student, professor, anon roles via `set local role` + JWT claims) |
| Types generated into `apps/web/lib/database.types.ts` | ✅ | Supabase type generator |
| pg_cron really runs | ✅ | `cron.job_run_details` shows `session_tick()` succeeding every minute; it created today's IOT401 session |

How the tests were run: through the Supabase connector (same SQL text as the files). `scripts/test-db.ps1` runs the
identical files through `scripts/db/run-sql.mjs`; that runner is **NOT VERIFIED against the DB yet** because the
repo-root `.env` with `SUPABASE_DB_URL` does not exist yet. It was syntax-checked and fails cleanly without the URL.

## Supabase project

- Project: **ATTENDIQ**, ref `vvdiqvcsevrhvgfezdru`, region `ap-northeast-1` (Tokyo — Seoul was requested; latency difference is negligible).
- Postgres 17. Extensions: vector 0.8.2, postgis 3.3.7, pg_cron 1.6.4, pg_net 0.20.4, pgcrypto 1.3 (all in schema `extensions`, pg_cron in `pg_catalog`).
- Migrations were applied via the Supabase connector; local file names match the recorded versions, so `npx supabase db push` will see them as applied.
- Seed was loaded once (idempotent; safe to re-run).
- A function `public.rls_auto_enable()` exists that we did not create (project default). The security advisor flags it as callable by anon. Left untouched — decide in Phase 8 security pass.

## Toolchain (checked 2026-11-18)

| Tool | Version | Notes |
|---|---|---|
| node | v24.19.0 | |
| npm | 11.17.0 | |
| python 3.11 | 3.11.9 via `py -3.11` | default `python` is 3.15 — always create venvs with `py -3.11 -m venv .venv` |
| git | 2.56.0.windows.4 | repo-local identity `mahiimran353` |
| Supabase CLI | 3.2.0 (`npx supabase`) | `supabase/config.toml` from `supabase init` |
| Docker | not installed | optional; SQL tests use the rolled-back-transaction runner instead |
| mosquitto | 2.1.2 | `C:\Program Files\mosquitto` (not on PATH). Windows service running, default config (localhost only) until Phase 5 |
| cloudflared | 2026.11.0 | |

## Resolved library versions

| Package | Version | Where |
|---|---|---|
| pg | 8.23.1 (pinned) | `scripts/db` (SQL test runner) |
| pgTAP | 1.3.3 | created inside each test transaction, never persisted |

## Database design notes (Phase 1)

- **Event storage:** every edge envelope goes into `edge_events` (idempotency ledger, `event_id` PK). Gate events and occupancy samples are also projected into typed `gate_events` / `occupancy_samples`. Heartbeats + camera status live only in `edge_events`.
- **Roles:** `profiles.role` comes ONLY from `raw_app_meta_data.role` (set by service role / admin invite). `raw_user_meta_data` is client-controlled at sign-up, so reading the role from it (as the build prompt said) would let anyone sign up as admin. Tested (test 1).
- **QR secret** lives in `session_secrets` (RLS on, no policies) so no client role can ever read it.
- **Fail-safe at finalize:** `pending → absent` only if (a) some room device sent an event during the session AND (b) the gate camera was offline ≤ 50 % of the on-time window. Otherwise students stay `pending` with flag `needs_review`.
- **Status rule:** earliest trusted evidence wins; rank present > late > absent(very_late) > pending; late/old replayed events can upgrade but never downgrade; excused / left_early / manual / appeal marks are never touched by evidence. Self-verify inside the FIRST mismatch window = present.
- **Recheck:** only students recorded in `verification_targets` (actually sent the recheck) can become `left_early`.
- **Clock:** every engine function takes `p_now` for tests; when called by a signed-in client it is forced to `now()`.
- **Device keys:** `sha256(utf8(key))` as lowercase hex in `edge_devices.api_key_hash`. Key format `sadev_` + 43 base64url chars.
- **Added beyond the spec:** `pending_enrollments` (email invites converted on sign-up), `verification_targets`, `holidays`, `session_secrets`, `policy.late_weight = 1`, `attendance_evidence.id`, evidence source `engine`.
- **Seed fixed UUIDs** (for simulator/tests) are listed at the top of `supabase/seed.sql`.

## How to run

- SQL tests: `scripts\test-db.ps1` (add `-Replay` for the from-zero replay). Needs `SUPABASE_DB_URL` in the repo-root `.env`.
- New device key: `scripts\new-device-key.ps1 -DeviceId <uuid> [-Apply]`.
- Regenerate types: `npx supabase gen types typescript --linked > apps/web/lib/database.types.ts` (after `npx supabase login` + `link`).

## Open issues / later phases

- `private.app_config` (`app_url`, `push_webhook_secret`) is empty until Phase 3; the push webhook trigger is a no-op until then (in-app inbox still works).
- Admin + professor have no password yet (seeded without one). Phase 2 adds a script to set them via the admin API.
- Professor manual mark RPC + appeal decision RPC: Phase 7.
- `apps/web/` now contains `.env.example` and `lib/database.types.ts`; Phase 2 moves them aside while `create-next-app` scaffolds, then restores them.

## Manual steps the user must do

1. ~~Install Git, Mosquitto, cloudflared~~ (done).
2. Copy `.env.example` → `.env` at the repo root and fill `SUPABASE_PROJECT_REF=vvdiqvcsevrhvgfezdru`, `SUPABASE_DB_PASSWORD`, `SUPABASE_DB_URL` (Dashboard → Connect → Session pooler). Then run `scripts\test-db.ps1 -Replay` once.
3. ~~Service-role key in `apps/web/.env.local`~~ (done 2026-11-18). It was pasted into chat to get it onto disk, so **rotate it** in Supabase (Project Settings → API Keys) when convenient and put the new one in `.env.local` with `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\set-service-key.ps1` (hidden-input prompt). Note: PowerShell script execution is disabled on this PC; project scripts need `-ExecutionPolicy Bypass` per run or `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once.
4. To sign in as the seeded admin: after the key is set, open `/admin/people` as the e2e admin (or ask Claude) and use "Password link" on `admin@attendance.test`, or use the e2e admin account.
5. Student self sign-up sends a confirmation email. Supabase's built-in mailer only delivers to project team members: either turn off "Confirm email" (Auth → Providers → Email) for the demo, or configure SMTP.
6. Vercel account linked to GitHub (Phase 3). Cloudflare account (Phase 4).
