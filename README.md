# Smart Attendance (AIoT)

University attendance system for an IoT course, mapped to the Cisco 7-layer IoT model.
A gate camera recognises students at the door, an inside camera counts people, and when the
numbers disagree the unmarked students verify on their own phone (face + liveness + room QR + GPS).

- Spec (source of truth for behaviour): [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Project rules and locked decisions (override the spec): [CLAUDE.md](CLAUDE.md)
- Build plan by phase: [BUILD_PROMPT.md](BUILD_PROMPT.md)
- Current status, versions, open issues: [PROGRESS.md](PROGRESS.md)

## Layout

```
apps/web/          Next.js PWA: admin, professor, student portals + all HTTP APIs (Vercel)
apps/face-api/     FastAPI + InsightFace, stateless: /embed, /health
apps/edge/         Python edge node: gate + occupancy pipelines, MQTT, SQLite outbox, heartbeat
apps/ingest/       Python MQTT subscriber -> POST /api/edge/v1/events (device key)
apps/simulator/    Python CLI: fake students/events/occupancy over MQTT (simulation=true)
firmware/esp32-door-led/   ESP32 door LED (PubSubClient)
supabase/          migrations, seed.sql, SQL tests
infra/mosquitto/   broker config + ACL (passwd is gitignored)
scripts/           PowerShell helpers (start-classroom, new-device-key, reset-demo, test-db)
```

## Prerequisites (Windows)

| Tool | Version | Install |
|---|---|---|
| Node.js | ≥ 20 | https://nodejs.org |
| Python | 3.11.x (via `py -3.11`) | python.org installer; coexists with other versions |
| Git | any recent | `winget install --id Git.Git -e` |
| Supabase CLI | via `npx supabase` | no install needed |
| Mosquitto | 2.x | `winget install --id EclipseFoundation.Mosquitto -e` |
| cloudflared | latest | `winget install --id Cloudflare.cloudflared -e` |
| MSVC Build Tools | 2022 | only if an InsightFace wheel has to compile |
| Docker Desktop | optional | enables `npx supabase test db` locally |

## Secrets

Every app has a committed `.env.example`. Copy it to `.env` (Python apps, repo root) or
`.env.local` (web) and fill it in. Never commit real values. The Supabase service-role key
lives only in `apps/web` server code.

## Database (Phase 1)

- Migrations: `supabase/migrations/` (apply with `npx supabase db push` after `npx supabase link`).
- Seed: `supabase/seed.sql` (demo university, room B204, 30 simulated students; idempotent).
- Tests: `scripts\test-db.ps1` (pgTAP, each file rolled back) and `scripts\test-db.ps1 -Replay`
  (drops everything, replays all migrations + seed from zero, checks, rolls back).
  Needs `SUPABASE_DB_URL` in the repo-root `.env`.
- Device keys: `scripts\new-device-key.ps1 -DeviceId <uuid> [-Apply]`.

## Quick start

Filled in as phases complete (see PROGRESS.md). Final fresh-laptop guide lands in Phase 8.
