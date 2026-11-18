# PROGRESS

Last updated: 2026-11-18

## Phase status

| Phase | Status | Gate |
|---|---|---|
| 0 Preflight | DONE (commit b0295a4) | tools ✅, skeleton ✅, .env.example per app ✅ |
| 1 Database | DONE (commit 1a130c2) | see Gate 1 below |
| 2 Web foundation | DONE (commit 5a4f6f0) | see Gate 2 below |
| 3 PWA + push + deploy | DONE (commit df75206) | see Gate 3 below |
| 4 Face API + enrollment | DONE (commit 85333a9) | see Gate 4 below |
| 5 Edge + MQTT + ingest + simulator | BUILT — gate needs the user's recording + live walk-past | see Gate 5 below |
| 6 Occupancy + live dashboard + self-verify | not started | |
| 7 Recheck, finalize, appeals, reports | not started | |
| 8 ESP32, hardening, docs | not started | |

## Gate 5 status (2026-11-18)

| Check | Result |
|---|---|
| pytest edge / ingest / simulator / pycommon | ✅ 24 / 7 / 7 / 5 (edge: line crossing, IoU tracker, voting rule incl. ambiguous + tied votes, dedupe + re-entry, outbox offline replay + idempotency + restart, camera offline/online + backoff, gate pipeline walk-in/out/stranger/small faces/presence mode, **2 tests on the real buffalo_l model**: enrolled face walking in -> RECOGNISED (score > 0.6), stranger -> UNKNOWN) · ruff clean |
| web lint / typecheck / vitest / build | ✅ / ✅ / 89 / ✅ |
| **Simulator: 30 simulated students get the correct statuses in the DB** | ✅ twice: over HTTP (`--direct`) and over the real IoT path simulator -> Mosquitto -> ingest -> API -> DB: 30/30 statuses (22 present, 5 late, 3 pending) and 30/30 flags (gate_out, reentry); 112 events stored, 3 duplicate event_ids ignored, unknown visitor logged, 0 real students touched |
| Edge process end to end (video file -> InsightFace -> MQTT + outbox -> ingest -> DB) | ✅ MQTT control `start` -> gallery fetched (RAM only) -> IN + UNKNOWN + camera online/offline + heartbeat stored via ingest-B204; outbox drained (0 unsent). Synthetic video (sample photo face), not a real recording |
| Device auth boundaries | ✅ no/bad key 401; simulator key on gallery 401; edge key on demo-session 401; other room 403; > 500 events 400 |
| Broker ACL | ✅ wrong password refused; simulator publishing `control` dropped; ingest `control` delivered to edge |
| Recorded video in `apps/edge/samples/` -> recognised entry | ⏳ NOT VERIFIED — needs the user's recording (instructions: `apps/edge/samples/README.md`) |
| **LIVE: user walks past phone #1 -> `present`** | ⏳ NOT VERIFIED — needs phone #1 + the deployed routes |
| Latency observed_at -> DB | ⏳ to be measured in the live test. Pipeline delay locally ~1 s; see clock finding below |

### Phase 5 decisions / notes
- **Laptop clock is ~2.5 min slow** (measured vs Vercel/Supabase: 153-156 s). That would turn late arrivals into "present". The edge now measures its offset from the server's HTTP `Date` header on every API call (median of 9) and stamps events with corrected time; heartbeats report `clock_offset_s` and the log warns above 5 s. The user should still sync Windows time.
- Migration 10 (`20261118111446_edge_api_sessions`): `class_sessions.is_simulation`; `current_session_for_room(room)`; `create_adhoc_session(room, section, starts_at, minutes, simulation)` (service role). Simulation runs supersede the previous one silently and **only simulated students get attendance rows** (real students are never notified about a simulation). Verified in a rolled-back transaction + the runs above.
- Admin -> Sections -> **"Start 30-min test session"** starts a real ad-hoc session now (for the live test outside the timetable); `session_tick` finalizes it at the end.
- Web routes (device key, `Authorization: Bearer`): `GET /api/edge/v1/sessions/current?room=`, `GET /api/edge/v1/sessions/{id}/gallery` (edge kind, own room, live sessions only), `POST /api/edge/v1/events` (<= 500, per-event validation stays in `apply_edge_events`), `POST /api/edge/v1/heartbeat`, `POST /api/edge/v1/sessions/demo` (simulator kind only).
- Shared Python package `packages/pycommon` (`attendiq_common`: pydantic envelope, topics, API client with clock offset), installed editable into each app venv.
- ingest: paho-mqtt 2.2 with **manual ack** + persistent session: a message is acked to the broker only after the API stored it (at-least-once; server dedupe by event_id makes it effectively exactly-once). Invalid envelopes and 4xx batches are dropped (logged), 5xx/network errors back off 1 -> 60 s. Session poll every 15 s -> retained `control` message.
- edge: `outbox.py` instead of `queue.py` (would shadow the stdlib module). Gate decision = >= 2 crops vote for the same student with score >= 0.45 and margin >= 0.08; tied votes -> unknown. `entry_mode: presence` added for a phone that only sees people walking IN (simplest live demo); `line` is the spec default. Unknown-face snapshots are NOT stored yet (privacy; spec item deferred to Phase 6/8).
- **Mosquitto**: the installer's Windows service already listens on 127.0.0.1:1883 with the stock config. The project broker (`infra/mosquitto/mosquitto.conf`, users + ACL, LAN listener) needs that port: stop the service once (admin) or run `start-classroom.ps1 -MqttPort 1884`. Tests above ran on 1884.
- Device keys for edge/ingest/simulator were generated into each app's gitignored `.env` (only SHA-256 hashes in `edge_devices`); MQTT passwords are hashed in the gitignored `infra/mosquitto/passwd`.

### Phase 5 versions
paho-mqtt 2.2.0 · pydantic 2.14.3 · pydantic-settings · httpx 0.28.1 · PyYAML 6.0.3 · psutil 7.2.2 · insightface 2.1 / onnxruntime 1.32.0 / opencv-python-headless 5.1.0.95 (edge) · Mosquitto (installed service) · pinned in apps/{edge,ingest,simulator}/requirements.txt

## Gate 4 results (2026-11-18) — PASSED

| Check | Result |
|---|---|
| face-api pytest + ruff | ✅ 18/18 (13 with a fake engine + 5 on the real buffalo_l model: single face OK with unit 512-d embedding, no face, two faces, blurred, same person > 0.6 vs others < 0.35) · ruff clean |
| web vitest | ✅ 85/85 (31 new: liveness state machine on synthetic landmark streams incl. static photo → timeout, always-closed eyes, smile flicker, wrong turn direction, second face, face lost; pose classifier + capture plan; outlier removal; duplicate decision; request schema; tunnel URL validation) |
| lint / typecheck / build | ✅ / ✅ / ✅ |
| face-api runs locally | ✅ `/health` model_loaded; `/embed` 401 without secret, embeddings with it |
| face-api through the tunnel | ✅ `scripts/start-face-api.ps1` → quick tunnel `https://<random>.trycloudflare.com/health` OK, `/embed` 401 without secret, 2 embeddings with it; URL stored in `private.app_config.face_api_url` |
| `/api/face/enroll` end-to-end (local dev server + real face-api, Playwright, test accounts removed afterwards) | ✅ no session → 401; no consent → 403; consent via UI → 6 embeddings stored, `face_profiles.status = active`, template set, model `insightface-buffalo_l`; second attempt → 409; **same face on a second account → `review`** with note naming the first student (similarity 1.00); different face → `active` |
| `scripts/face-eval.py` | ✅ runs; `docs/face-eval.md` holds only a pipeline smoke test (synthetic genuine pairs). **NOT VERIFIED on real photos** — needs `eval/<person>/` photos |
| **User enrolls on the phone → active with ≥ 5 embeddings** | ✅ USER ENROLLED on the Android phone via production (07:06:21 UTC): liveness smile/turn_right/turn_left passed; face-api got 10 photos, accepted 9 (one `down` shot rejected by a quality gate); `face_profiles.status = active`, **9 embeddings** (front×2, left×2, right×2, up×2, down×1, det_score 0.70–0.84), template set, consent row present |
| **Duplicate check flags a second account with the user's face** | ✅ USER TESTED on the phone (07:17:29 UTC): test account `student1@attendence.test` enrolled with the user's face → 10/10 photos accepted → `face_profiles.status = review`, note "possible duplicate of student c244f101… (similarity 0.90)", 160 px thumbnail (3.1 KB) stored in `face-review` |
| Real-world similarity | Same person, two separate phone sessions 11 minutes apart: **0.90** best match (duplicate threshold 0.60, gate threshold 0.45) |
| NOT VERIFIED | Admin review queue rendering the thumbnail (signed URL) on the deployed site — not opened yet; iPhone/Safari camera + MediaPipe (only Android Chrome tested); threshold report on real multi-person photos (`docs/face-eval.md` is a smoke test) |

### Phase 4 decisions / notes
- **InsightFace 2.1** installs from a wheel on Windows/Python 3.11: no MSVC Build Tools needed. **Smart App Control had to be turned off** (it blocks onnx/onnxruntime DLLs); the user did it.
- **Model licence:** InsightFace code is MIT, the pretrained `buffalo_l` weights are **non-commercial research only** (noted in apps/face-api/README.md).
- face-api stays stateless: Next.js does consent, outlier removal (embedding vs the person's own mean < 0.45 → dropped), duplicate check (`match_face_any` per embedding, any other student > 0.60 → `review`) and storage (`store_face_enrollment`, one transaction, L2-normalised mean template, audit actor = the student).
- Students can enroll only from `pending`/`rejected`/`deleted`; an `active` or `review` profile needs an admin reset (stops someone re-enrolling another person's account).
- Consent: versioned text in `lib/consent.ts` (`2026-11-v1`); withdrawing deletes embeddings + template + review thumbnail.
- **Head yaw/pitch come from landmark geometry** (nose vs eye corners, normalised by eye distance) instead of the facial transformation matrix the build prompt mentions: scale-free, easy to unit-test with synthetic landmarks, no matrix sign conventions to guess. Blink/smile use the `eyeBlink*`/`mouthSmile*` blendshapes as specified.
- Liveness = 3 random challenges from {blink, turn left, turn right, smile}; each needs a change (open→closed→open, neutral→smile held 250 ms, centre→turn→centre), 8 s per challenge, a second face for 300 ms or no face for 1 s fails. Capture right after liveness: 2 auto-shots each front/left/right/up/down (pitch relative to the person's neutral pitch), face must stay in view. Liveness is client-side (as specified); the server only checks that a passed result is present — a determined attacker with a modified client can skip it. Server-side liveness (InsightFace has an addon) is a possible Phase 8 hardening.
- MediaPipe runtime is self-hosted: `scripts/copy-mediapipe.mjs` (predev/prebuild) copies the WASM from the pinned package and downloads `face_landmarker.task` (float16 v1, 3.8 MB) into `public/mediapipe/` (gitignored).
- **Face-api URL:** `FACE_API_URL` env if set (local dev: `http://127.0.0.1:8000`), else `private.app_config.face_api_url`. `start-face-api.ps1` publishes the tunnel URL through `POST /api/edge/v1/face-api-url` with the laptop's **edge device key** (`Authorization: Bearer`), so the laptop never holds Supabase credentials. Until `apps/edge/.env` exists (Phase 5) the script prints the SQL instead.
- Quick tunnel (no Cloudflare account) is used for now: URL changes on every start. A named tunnel needs a Cloudflare account + a domain (`-TunnelName face -PublicUrl https://face.<domain>`).
- Review thumbnails: 160 px JPEG, only stored when an enrollment goes to `review`, private bucket `face-review`, shown to admins via 5-minute signed URLs, deleted on approve/reject/withdraw.

### Phase 4 versions
Python 3.11.9 · insightface 2.1 · onnxruntime 1.32.0 · numpy 2.4.6 · opencv-python-headless 5.1.0.95 · fastapi 0.163.2 · uvicorn 0.54.0 · python-multipart 0.0.34 · pydantic-settings 2.16.3 · pytest 9.2.0 · ruff 0.17.5 (all in apps/face-api/requirements.txt) · @mediapipe/tasks-vision 1.2.3 · cloudflared 2026.11.0

## Gate 3 results (2026-11-18)

| Check | Result |
|---|---|
| Deployed URL | ✅ https://attendiq-rho.vercel.app (Vercel project `attendiq`, team mdmahi1212's projects, from GitHub `mdmahi1212/ATTENDIQ` (private) `main`, root `apps/web`, Node 24.x, functions in `hnd1` Tokyo next to Supabase) |
| Public reachability | ✅ /login, /manifest.webmanifest, /sw.js, icons → 200; /admin signed-out → 307 /login; push-dispatch without secret → 401 (Vercel Authentication does not cover the production domain) |
| DB webhook → push-dispatch | ✅ pg_net call accepted (HTTP 200) after the secret was set via `scripts/rotate-webhook-secret.mjs` |
| **Enrolling a student creates `enroll_face` and a real push arrives on the phone** | ✅ USER CONFIRMED: real student enrolled in IOT401-01 at 06:27:26 UTC → `enroll_face` notification → dispatch `{"sent":2,"removed":0,"failed":[]}` (Android Chrome + Windows Chrome via FCM) → push arrived on the Android phone and tapping it opened /student/enroll |
| lint / typecheck / unit / build | ✅ 0 problems / ✅ / 54/54 / ✅ |
| Playwright e2e | ✅ 7/7 (adds: Realtime inbox shows a new notification without reload + click marks read; subscribe and dispatch APIs refuse anonymous calls) |
| Local dispatch test | ✅ wrong secret → 401; right secret with a dead FCM token → removed=1 (404/410 cleanup) |
| NOT VERIFIED | iPhone push (no iPhone tested; the iOS Add-to-Home-Screen path is implemented and unit-tested, not tried on a device) |

### Phase 3 decisions / notes
- `web-push` **4.0.0** is ESM-only with named exports and an unbound `setVapidDetails`; VAPID details are passed per `sendNotification` call. Types: `@types/web-push` 3.6.4 (still matches the call signatures used).
- VAPID subject = the app URL (`https://attendiq-rho.vercel.app`), not a personal email.
- Push TTL = time left in the notification's window (0 → not sent); verify/recheck pushes are `urgency: high`, `requireInteraction`, one per window (`tag`).
- Realtime inbox: the browser client must load the session and call `realtime.setAuth()` **before** joining, otherwise the socket joins as anon and RLS delivers nothing (found by the e2e test, fixed).
- Migration 08 (`20261118062036_set_push_webhook_secret_rpc`): `set_push_webhook_secret(text)` (service role only) so the secret never has to be typed into the SQL editor.
- Env vars were pushed with `apps/web/scripts/push-vercel-env.mjs` (Vercel CLI 66.1.0, values via stdin, secrets Sensitive) because the Vercel connector has no permission to create env vars. Rotate the webhook secret any time with `node scripts/rotate-webhook-secret.mjs` (then redeploy).
- On this PC use `npx.cmd`, not `npx`, in PowerShell (script execution is disabled).

### Phase 3 versions
web-push 4.0.0 · @types/web-push 3.6.4 · Vercel CLI 66.1.0 (via npx, not installed) · Vercel build image Node 24.x

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
- Whole classroom stack: `powershell -ExecutionPolicy Bypass -File scripts\start-classroom.ps1` (Mosquitto, face-api + tunnel, ingest, edge; logs in `logs\`).
- Simulator: `cd apps\simulator; .\.venv\Scripts\python.exe -m simulator run` (MQTT) or `... run --direct` (HTTP).
- Face API + tunnel: `powershell -ExecutionPolicy Bypass -File scripts\start-face-api.ps1` (keep the window open while students enroll).
- Face threshold eval: `appsace-api\.venv\Scripts\python.exe scriptsace-eval.py eval --out docsace-eval.md`.
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
6. ~~Vercel + GitHub (Phase 3)~~ (done). Optional: Cloudflare account + domain for a fixed face-api hostname (named tunnel); the quick tunnel works without one.
7. Push new commits yourself (`git push`): this session is not allowed to push. Vercel redeploys production on every push to `main`.
8. After rotating the Supabase secret key: update `apps/web/.env.local`, run `node scripts/push-vercel-env.mjs` from `apps/web`, then redeploy.
9. Gate 4 left a test student `student1@attendence.test` (password: `DUP_TEST_STUDENT_PASSWORD` in `apps/web/.env.local`) in face status `review`. Its 10 embeddings and thumbnail are **your face**: try Approve/Reject in /admin/faces, then have it deleted.
10. **Sync the Windows clock** (it is ~2.5 min slow): Settings -> Time & language -> Date & time -> turn on "Set time automatically" -> "Sync now". The edge corrects for it anyway, but other tools trust the clock.
11. **Free MQTT port 1883** for the project broker, once, in an ADMIN PowerShell: `Stop-Service mosquitto; Set-Service mosquitto -StartupType Manual` (or always start with `scripts\start-classroom.ps1 -MqttPort 1884`).
