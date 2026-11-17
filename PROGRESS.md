# PROGRESS

Last updated: 2026-11-18

## Phase status

| Phase | Status | Gate |
|---|---|---|
| 0 Preflight | DONE — skeleton committed | tools ✅, skeleton committed ✅, .env.example per app ✅; waiting on Supabase project details for Phase 1 |
| 1 Database | not started | |
| 2 Web foundation | not started | |
| 3 PWA + push + deploy | not started | |
| 4 Face API + enrollment | not started | |
| 5 Edge + MQTT + ingest + simulator | not started | |
| 6 Occupancy + live dashboard + self-verify | not started | |
| 7 Recheck, finalize, appeals, reports | not started | |
| 8 ESP32, hardening, docs | not started | |

## Toolchain (checked 2026-11-18)

| Tool | Found | Notes |
|---|---|---|
| node | v24.19.0 | OK (≥ 20) |
| npm | 11.17.0 | OK |
| python (default) | 3.15.2 | NOT used for this project |
| python 3.11 | 3.11.9 via `py -3.11` | OK — create every venv with `py -3.11 -m venv .venv` |
| git | 2.56.0.windows.4 | installed via winget 2026-11-18; repo identity set locally (user.name `mahiimran353`, change with `git config user.name`) |
| Supabase CLI | 3.2.0 (`npx supabase`) | OK |
| Docker | NOT INSTALLED | optional; without it SQL tests run via `scripts/test-db.ps1` against the linked project |
| mosquitto | 2.1.2 | winget; at `C:\Program Files\mosquitto` (NOT on PATH — scripts use `MOSQUITTO_DIR`). Installed as a Windows service, running, auto-start, default config (localhost only). Phase 5 replaces the config with password + ACL |
| cloudflared | 2026.11.0 | winget |

## Resolved library versions

None yet (recorded per phase).

## Decisions taken in Phase 0

- Repo path is `C:\dev\smart-attendence-system` (no spaces — OK; differs from the suggested `C:\dev\smart-attendance`).
- Secrets for the edge go in `apps/edge/.env`; non-secret tuning in `apps/edge/config.yaml` (gitignored, example ships in Phase 5).
- Recorded sample videos (`apps/edge/samples/`) and face eval sets (`eval/`) are gitignored: they contain real faces.
- `apps/web/.env.example` already exists; during Phase 2 it is moved aside while `create-next-app` scaffolds into `apps/web`, then restored.

## Open issues / questions for the user

See the Phase 0 report in chat; answers get recorded here.

## Manual steps the user must do

1. ~~Install Git, Mosquitto, cloudflared~~ (done).
2. Create the Supabase project (Seoul) and send: project ref, URL, anon key, service-role key, DB password.
3. Vercel account linked to GitHub (Phase 3). Cloudflare account (Phase 4).
