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

## Web app (Phases 2–3)

- Live: https://attendiq-rho.vercel.app (Vercel project `attendiq`, deploys `main` of the private GitHub repo).
- Local: `cd apps/web; npm run dev | npm run lint | npm run typecheck | npm test | npm run build | npm run e2e`
  (on Windows PowerShell with script execution disabled, use `npm.cmd` / `npx.cmd`).
- Env: `apps/web/.env.local` (gitignored). Push it to Vercel with `node scripts/push-vercel-env.mjs` (Vercel CLI login needed).
- Push webhook secret: `node scripts/rotate-webhook-secret.mjs` sets it in the DB, Vercel and `.env.local` together; then redeploy.
- Icons: `node scripts/make-icons.mjs` regenerates `public/icons/*.png`.

## Quick start (fresh Windows laptop -> running demo)

Assumes the Supabase project and the Vercel deployment already exist (they do: https://attendiq-rho.vercel.app).
For a brand-new Supabase project apply `supabase/migrations/*` + `supabase/seed.sql` first (`npx supabase db push`).

1. **Tools**: Node ≥ 20, Python 3.11 (`py -3.11`), Git, Mosquitto, cloudflared (see Prerequisites). Clone to a path
   without spaces, e.g. `C:\dev\smart-attendance`.
2. **Web app (only for local development; production is Vercel)**
   ```powershell
   cd apps\web; npm.cmd ci; copy .env.example .env.local   # fill Supabase URL/keys, VAPID, FACE_API_SECRET, PUSH_WEBHOOK_SECRET
   npm.cmd run dev                                          # http://localhost:3000 (copies the MediaPipe runtime first)
   ```
3. **Python apps** (one venv each)
   ```powershell
   cd apps\face-api;  py -3.11 -m venv .venv; .\.venv\Scripts\pip install -r requirements.txt; copy .env.example .env
   cd ..\ingest;      py -3.11 -m venv .venv; .\.venv\Scripts\pip install -r requirements.txt; copy .env.example .env
   cd ..\simulator;   py -3.11 -m venv .venv; .\.venv\Scripts\pip install -r requirements.txt; copy .env.example .env
   cd ..\edge;        py -3.11 -m venv .venv; .\.venv\Scripts\pip install --extra-index-url https://download.pytorch.org/whl/cpu -r requirements.txt; copy .env.example .env; copy config.example.yaml config.yaml
   ```
   Windows **Smart App Control** blocks onnxruntime's DLLs; it must be off (Windows Security → App & browser control).
4. **Secrets**: `apps\face-api\.env` `FACE_API_SECRET` = the same value as in `apps\web\.env.local` and Vercel.
   Device keys + MQTT users (printed once; put them in each app's `.env`):
   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\new-device-key.ps1 -DeviceId e0000000-0000-4000-8000-000000000001 -MqttUser edge-B204       # EDGE_DEVICE_KEY
   powershell -ExecutionPolicy Bypass -File scripts\new-device-key.ps1 -DeviceId e0000000-0000-4000-8000-000000000002 -MqttUser ingest-B204     # INGEST_DEVICE_KEY
   powershell -ExecutionPolicy Bypass -File scripts\new-device-key.ps1 -DeviceId e0000000-0000-4000-8000-000000000003 -MqttUser simulator-B204  # SIM_DEVICE_KEY
   ```
   (The key hash goes into `edge_devices` with `-Apply` (needs `SUPABASE_DB_URL`) or via Operator → Devices → rotate key.)
5. **Models**: the first face-api start downloads buffalo_l (~280 MB) and the liveness addon; YOLO weights:
   `cd apps\edge; .\.venv\Scripts\python -c "from ultralytics import YOLO; YOLO('yolov8n.pt')"` then move `yolov8n.pt` to `apps\edge\models\`.
6. **Phone #1**: install IP Webcam, Start server, set `GATE_CAMERA_SOURCE=http://<phone-ip>:8080/video` in `apps\edge\.env`.
7. **Run the classroom stack** (Mosquitto, face-api + tunnel, ingest, edge — each in its own window, logs in `logs\`):
   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\start-classroom.ps1 -MqttPort 1884
   ```
   (`-MqttPort 1884` while the Mosquitto Windows service holds 1883.) The face-api script publishes its tunnel URL to
   the web app automatically.
8. **Try it**: Admin → Demo → *Full class* (or 5 / 10 / 15 min); open it from the dashboard; walk past phone #1; or run the
   simulator: `cd apps\simulator; .\.venv\Scripts\python.exe -m simulator run`. Full walkthrough: `docs/DEMO_SCRIPT.md`.
9. **Reset before a demo**: `powershell -ExecutionPolicy Bypass -File scripts\reset-demo.ps1`.

More: `docs/TESTING.md` (every test + metrics), `docs/CISCO_LAYERS.md` (layer mapping), `apps/face-api/README.md`,
`firmware/esp32-door-led/README.md`, troubleshooting in `PROGRESS.md`.
