# CLAUDE.md — Smart Attendance (AIoT) project rules

Claude Code reads this file at the start of every session. Follow it strictly.

## What we are building
A university attendance system for an IoT course, mapped to the Cisco 7-layer IoT model:
- Gate camera (phone #1 via IP Webcam) → face recognition on the edge laptop → students marked present/late.
- Inside camera (laptop webcam or phone #2) → person count.
- Count > verified → push "verify now" to unmarked students → they verify on their phone with face + liveness + room QR (+ GPS).
- T_end − 10 min: count < verified → professor alert → recheck → non-verifiers become `left_early` (counted absent by default policy).
- Admin / Professor / Student portals, appeals, reports, audit log.

The full spec is `docs/ARCHITECTURE.md`. It is the source of truth for behaviour, rules, schema, events and APIs.
Where this file and the spec disagree, THIS FILE wins (it contains later corrections).

## Locked architecture decisions (do not change without asking the user)
| Part | Choice |
|---|---|
| Web (all portals + API routes) | Next.js (App Router, TypeScript strict), Tailwind, shadcn/ui, PWA, deployed on Vercel |
| Auth / DB / Realtime / Storage | Supabase (Postgres + pgvector + PostGIS + pg_cron + pg_net), RLS on every table |
| Supabase client in Next.js | `@supabase/ssr` (NOT the deprecated auth-helpers) |
| Face embeddings | `apps/face-api`: Python 3.11 FastAPI + InsightFace `buffalo_l` (CPU, onnxruntime). **Stateless compute only**: images in → embeddings + quality out. It has NO database credentials. |
| Edge AI | `apps/edge`: Python 3.11, OpenCV, InsightFace (gate), Ultralytics YOLOv8n + tracking (inside count) |
| IoT messaging | MQTT (Mosquitto on the laptop). Edge publishes → `apps/ingest` subscribes → POSTs batches to Next.js `/api/edge/v1/events` with a device key |
| Push | Web Push (VAPID) with the `web-push` npm package inside a Next.js **Node runtime** route. Triggered by a Supabase database webhook on `notifications` insert. In-app inbox via Realtime is the fallback. |
| Rule engine | Postgres SQL functions, driven by `pg_cron` every minute (`session_tick()`). Vercel cron is NOT used. |
| Supabase Edge Functions (Deno) | Not needed. Never try to run InsightFace/ONNX in Deno. |
| Liveness | MediaPipe Face Landmarker (`@mediapipe/tasks-vision`) in the browser: random blink / turn-left / turn-right challenge |
| Room presence proof | Rotating QR: `HMAC_SHA256(qr_secret, session_id + ":" + floor(epoch_seconds/20))`, accept current + previous slot |

## Security rules
- The Supabase **service-role key** exists ONLY in server-side Next.js code (route handlers, server actions) and never in the browser, the edge laptop, the face-api, or git.
- Edge, ingest and simulator authenticate to Next.js with per-device API keys (stored hashed with SHA-256 in `edge_devices.api_key_hash`).
- Next.js → face-api calls carry `X-Face-Api-Secret` (shared secret env var). The browser never calls face-api directly.
- Every table has RLS enabled plus explicit policies. Views use `security_invoker = true`.
- Secrets live in `.env.local` / `.env` (gitignored). Every app ships a complete `.env.example`.
- Every admin/professor change to attendance goes to `audit_log` (by DB trigger, not app code).

## Time rules
- Store all timestamps as `timestamptz` (UTC). Timetable `time` columns are Asia/Seoul local time; convert with `AT TIME ZONE 'Asia/Seoul'`.
- Status timing always uses server time (DB `now()` or event `observed_at` from the NTP-synced edge), never the phone clock.

## Working rules for Claude Code
1. At the start of every session: read `CLAUDE.md`, `PROGRESS.md`, and the relevant sections of `docs/ARCHITECTURE.md`.
2. Work ONE phase at a time from `BUILD_PROMPT.md`. Do not start the next phase until the current phase's gate passes and the user says continue.
3. Never claim something works unless you ran it and saw it work. If a check needs hardware or a human (phone, camera, walking through a door), say so explicitly and give the user exact test steps.
4. Never weaken, skip or delete a test to make it pass. Fix the code. If a test is genuinely wrong, explain why before changing it.
5. When unsure about a library API, read the installed package's types/README (`node_modules/<pkg>`, `pip show`, source) or the official docs. Do not guess function names or options.
6. Use the versions the official installers give today (`create-next-app@latest`, `pip install` without pins), then record the exact resolved versions in `PROGRESS.md` and pin them (`package-lock.json`, `requirements.txt` with `==`).
7. After each phase: run lint + typecheck + unit tests + build for every touched app; fix everything; update `PROGRESS.md`; `git commit -m "phase N: ..."`.
8. Keep files small and typed. No `any` in TypeScript unless commented why. Python uses type hints and `ruff`.
9. Ask the user before: adding a new paid service, changing a locked decision, deleting data, or anything that needs their accounts/keys.
10. The dev machine is Windows. Write PowerShell-compatible scripts (`scripts/*.ps1`) and use `pathlib` in Python. Avoid paths with spaces for the repo (recommend `C:\dev\smart-attendance`).

## Commands (fill in as they are created)
- Web: `cd apps/web; npm run dev | npm run lint | npm run typecheck | npm test | npm run build | npm run e2e` (use `npm.cmd` / `npx.cmd` in PowerShell)
- Web e2e against the production build: `npm run build; npx next start -p 3100`, then `$env:E2E_BASE_URL='http://localhost:3100'; npx playwright test`
- DB: `npx supabase db push`; types: `npx supabase gen types typescript --linked > apps/web/lib/database.types.ts` (or the Supabase MCP `generate_typescript_types`)
- SQL tests: `scripts\test-db.ps1` (needs `SUPABASE_DB_URL`) — files in `supabase/tests/*.test.sql`, each rolled back
- Python apps (`apps/face-api`, `apps/edge`, `apps/ingest`, `apps/simulator`): `.\.venv\Scripts\activate; ruff check .; pytest`
- Gate 7 live check: `cd apps/simulator; $env:SIM_LIVE='1'; .\.venv\Scripts\python.exe -m pytest tests\test_gate7_live.py`
- Start everything on the laptop: `powershell -ExecutionPolicy Bypass -File scripts\start-classroom.ps1 [-MqttPort 1884]`
- Face API + tunnel only: `powershell -ExecutionPolicy Bypass -File scripts\start-face-api.ps1`
- Simulator: `cd apps/simulator; .\.venv\Scripts\python.exe -m simulator run [--direct] [--finalize] [--script scripts/mismatch.yaml --hold-minutes 3]`
- Device key (+ MQTT user): `powershell -ExecutionPolicy Bypass -File scripts\new-device-key.ps1 -DeviceId <uuid> [-Apply] [-MqttUser <name>]`
- Reset demo data: `powershell -ExecutionPolicy Bypass -File scripts\reset-demo.ps1`
- Push web env to Vercel: `cd apps/web; node scripts/push-vercel-env.mjs`
