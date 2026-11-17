# BUILD PROMPT — Smart Attendance AIoT System

> Paste the block below into Claude Code as the first message, from inside the repo folder
> (which already contains `CLAUDE.md`, `BUILD_PROMPT.md` and `docs/ARCHITECTURE.md`).
> After each phase, Claude Code stops and reports. Type `continue` to start the next phase.

---

You are the lead engineer building a complete, working university attendance system for my IoT course. Read `CLAUDE.md` (rules + locked decisions — these override everything) and `docs/ARCHITECTURE.md` (full spec) before writing any code. Then build the system phase by phase as described below.

## How you must work

- Build **one phase at a time**. Each phase ends with a **GATE**: a list of checks you must actually run. Show me the command output summary. If any check fails, fix it before reporting. Then stop and wait for me to type `continue`.
- Keep `PROGRESS.md` updated at the repo root: phase status, what works, exact library versions, how to run each app, open issues, and anything I must do by hand.
- If a step needs something only I can do (create an account, paste a key, plug in a phone, walk past a camera), stop and give me numbered, exact instructions, then wait.
- Never fake a result. If you could not run something, say "NOT VERIFIED" and why.
- Prefer boring, well-documented solutions. No experimental libraries.
- Before you write code that uses a library, check its current API (installed types or docs). Next.js, Supabase and Ultralytics APIs change between versions.

## Target repo layout

```
smart-attendance/
├─ CLAUDE.md  BUILD_PROMPT.md  PROGRESS.md  README.md  .gitignore
├─ docs/ARCHITECTURE.md
├─ apps/
│  ├─ web/          Next.js PWA: admin, professor, student portals + all HTTP APIs
│  ├─ face-api/     FastAPI + InsightFace, stateless: /embed, /health
│  ├─ edge/         Python edge node: gate pipeline, occupancy pipeline, MQTT publisher, SQLite queue, heartbeat
│  ├─ ingest/       Python MQTT subscriber → POST /api/edge/v1/events (device key)
│  └─ simulator/    Python CLI: fake students/events/occupancy over MQTT (simulation=true)
├─ firmware/esp32-door-led/   Arduino sketch (PubSubClient) for the door LED
├─ supabase/
│  ├─ migrations/   ordered SQL migrations
│  ├─ seed.sql      demo university (1 dept, 2 courses, 1 room, 3 real + 30 simulated students)
│  └─ tests/        SQL tests for the rule engine
├─ infra/mosquitto/ mosquitto.conf, passwd (gitignored), acl
└─ scripts/         start-classroom.ps1, new-device-key.ps1, reset-demo.ps1
```

## Global contracts (implement exactly)

### Roles
`admin`, `professor`, `student`, `operator` (IoT operator: device management only, no attendance access). Stored in `profiles.role`. Devices are NOT Supabase users; they use API keys.

### Attendance status + method
- Status enum: `pending | present | late | absent | left_early | excused`.
- Method: `gate | self_verify | recheck | manual | appeal`.
- Default policy (copied into `class_sessions.policy` jsonb at session start; editable in admin settings):
```json
{
  "present_until_min": 10,
  "late_until_min": 30,
  "first_mismatch_check_min": 10,
  "mismatch_interval_min": 5,
  "verify_window_min": 5,
  "recheck_before_end_min": 10,
  "recheck_window_min": 4,
  "count_tolerance": 1,
  "stable_count_seconds": 60,
  "left_early_counts_as": "absent",
  "lock_after_hours": 48,
  "appeal_days": 7,
  "gate_accept_threshold": 0.45,
  "gate_min_margin": 0.08,
  "gate_min_votes": 2,
  "verify_threshold": 0.50,
  "gps_max_accuracy_m": 40,
  "qr_slot_seconds": 20,
  "warn_attendance_pct": [85, 75]
}
```
- Status is decided by the **earliest trusted evidence time** (gate recognition, or a passed self-verify, or a passed recheck).
  - ≤ start + present_until → `present`; ≤ start + late_until → `late`; later → stays `absent` but flagged `very_late` in `attendance.note`.
  - A student who passes self-verify **inside the first mismatch window** is `present` (camera miss), regardless of the minute.
  - A status is never downgraded by time once set, except `present/late → left_early` by a failed recheck.
- **Fail-safe**: missing data never becomes `absent` automatically, EXCEPT (a) no evidence at all at finalize while the session's devices were healthy, or (b) a recheck the student was actually sent and didn't pass. If the gate camera was offline for > 50 % of the on-time window, finalize marks unverified students `pending` for professor review instead of `absent`.

### Event envelope (MQTT payload and `/api/edge/v1/events` body items)
```json
{
  "event_id": "uuid-v4",
  "event_type": "GATE_ENTRY_RECOGNISED",
  "source_device_id": "uuid of edge_devices row",
  "session_id": "uuid",
  "observed_at": "ISO-8601 UTC",
  "model_version": "buffalo_l/thr0.45",
  "payload": {},
  "simulation": false
}
```
Event types: `GATE_PERSON_IN, GATE_PERSON_OUT, GATE_ENTRY_RECOGNISED, GATE_ENTRY_UNKNOWN, OCCUPANCY_UPDATED, CAMERA_OFFLINE, CAMERA_ONLINE, EDGE_HEARTBEAT`.
The server is idempotent on `event_id` (unique constraint, `on conflict do nothing`) and sets `received_at`.

### MQTT topics (room = room code, e.g. `B204`)
- `campus/{room}/gate/event`, `campus/{room}/inside/occupancy`, `campus/{room}/device/heartbeat` (edge → ingest, QoS 1)
- `campus/{room}/gate/feedback` (edge → ESP32, QoS 0, payload `{"result":"ok"|"unknown"}`)
- `campus/{room}/control` (ingest → edge, payload `{"cmd":"start"|"stop"|"reload_gallery","session_id":"..."}`; ingest polls `/api/edge/v1/sessions/current` every 15 s and publishes changes)
- Mosquitto: password file, one user per device, ACL restricts each device to its room's topics. Dev on 1883 (LAN only); TLS 8883 documented as an optional final step.

### HTTP API (Next.js route handlers; validate every body with `zod`)
Device-key APIs (header `Authorization: Bearer <device_key>`):
- `GET  /api/edge/v1/sessions/current?room=B204` → active session + policy, or 204
- `GET  /api/edge/v1/sessions/{id}/gallery` → `{ students: [{ id, name_initials, embeddings: number[][] }] }` only for students enrolled in that session's section with `face_profiles.status='active'`
- `POST /api/edge/v1/events` → batch ≤ 500 envelopes → `{ accepted, duplicates, rejected: [{event_id, reason}] }`
- `POST /api/edge/v1/heartbeat`

Face API (internal, from Next.js server only, header `X-Face-Api-Secret`):
- `POST /embed` multipart images → `[{ ok, embedding?: number[512], det_score, face_px, blur, reason? }]` (exactly one face required per image)
- `GET /health`

User APIs (Supabase session cookie; role checked server-side):
- `POST /api/face/enroll` (student): 5–10 images + liveness result → calls `/embed`, rejects bad images, duplicate check (`match_face_any` RPC: any other student with similarity > 0.6 → status `review`), stores embeddings + mean template, sets `face_profiles.status`.
- `POST /api/verify/{requestId}` (student): `{ frame, liveness, lat, lng, accuracy, qr_token }` → server checks window open, enrollment, QR HMAC, geofence (PostGIS `ST_DWithin(geofence, point, accuracy)`), face 1:1 (`match_face` RPC ≥ verify_threshold) → writes `verification_attempts` → RPC `apply_self_verification`. Max 3 attempts per request per student. Pass rule: face AND liveness AND (QR OR (GPS inside AND accuracy ≤ max)). QR is required if `rooms.require_qr = true` (default true).
- `POST /api/sessions/{id}/start|end|cancel`, `POST /api/sessions/{id}/verify-requests` (professor: kind `mismatch|recheck|manual`), `GET /api/sessions/{id}/qr` (professor; returns current token + expiry)
- `PATCH /api/attendance/{sessionId}/{studentId}` (professor; requires `reason`)
- `POST /api/appeals`, `PATCH /api/appeals/{id}`
- `POST /api/push/subscribe`, `DELETE /api/push/subscribe`
- `POST /api/internal/push-dispatch` (called by the Supabase DB webhook; header `X-Webhook-Secret`) → sends Web Push for a notification row; deletes subscriptions that return 404/410.

---

## PHASE 0 — Preflight (no feature code)

1. Check installed tools and print versions: `node -v` (need ≥ 20), `npm -v`, `python --version` (need 3.11.x; if missing, tell me how to install it alongside other versions with the `py` launcher), `git --version`, `npx supabase --version`, Docker (optional), `mosquitto -h`.
2. Tell me exactly what to create and paste, then wait:
   - Supabase project (region: Northeast Asia / Seoul). I give you: project ref, URL, anon key, service-role key, DB password.
   - Vercel account linked to GitHub (needed later in Phase 3).
   - Cloudflare account + `cloudflared` installed (Phase 4).
3. Create the repo skeleton, `.gitignore` (node_modules, .venv, .env*, !.env.example, *.db, infra/mosquitto/passwd, models/), `README.md`, `PROGRESS.md`, and commit.

**GATE 0:** all tools print versions; repo skeleton committed; `.env.example` files list every variable each app will need.

## PHASE 1 — Database (schema, RLS, rule engine, seed, tests)

Write ordered migrations in `supabase/migrations/`. Start from the schema in `docs/ARCHITECTURE.md` and the `attendance_evidence` table, with these corrections:
- Create `departments` **before** `profiles` (the spec lists them in the wrong order).
- Extensions: `vector`, `postgis`, `pg_cron`, `pg_net`, `pgcrypto`.
- Add the `operator` role to the enum. Add `rooms.code text unique`, `rooms.require_qr boolean default true`, `class_sessions.gate_offline_seconds int default 0`, `attendance.flags text[] default '{}'`, `gate_events.received_at timestamptz default now()`, `gate_events.simulation boolean`, the same `simulation` column on `occupancy_samples`, and `profiles.is_simulated boolean default false`.
- Event tables: store every edge event type. Either keep `gate_events` + `occupancy_samples` + a generic `edge_events` table for heartbeats/camera status, or use one `edge_events` table with typed views. Pick one and document it.
- Indexes on every FK, `(session_id, ts)`, `(student_id)`; HNSW cosine index on `face_embeddings.embedding`; unique `(session_id, student_id)` on attendance; unique `event_id`.
- `profiles` row auto-created by a trigger on `auth.users` insert (role from `raw_user_meta_data`, default `student`; only admins can change roles, enforced by RLS + a check in the trigger).

Functions (SQL / plpgsql, `security definer` only where needed, with `set search_path = public`):
- `match_face(p_student uuid, p_embedding vector) returns real` — max cosine similarity (`1 - (embedding <=> p_embedding)`) against that student's embeddings.
- `match_face_any(p_embedding vector, p_exclude uuid) returns table(student_id uuid, similarity real)` — top 3.
- `apply_edge_events(p_device uuid, p_events jsonb) returns jsonb` — idempotent insert + attendance updates (recognised entry → status by timing rule; OUT/IN → re-entry flag; camera offline → accumulate gate_offline_seconds).
- `apply_self_verification(p_attempt uuid)`, `open_verification_request(p_session uuid, p_kind text, p_by uuid)`.
- `session_tick()` — run by `pg_cron` every minute: create today's sessions from `timetable_slots` (Asia/Seoul, skip holidays/cancelled); `scheduled → live` at start − 10 min (copy policy, create pending attendance rows for current enrollments, generate `qr_secret`); mismatch checks per policy using the latest **stable** occupancy (`stable = true`, minus `staff_count`); auto-open recheck at end − N if count < verified − tolerance (also notify professor); close expired verification windows; at end run `finalize_session`; lock sessions after `lock_after_hours`.
- `finalize_session(p_session uuid)` — per fail-safe rules above; writes `attendance_evidence` + `audit_log`.
- `attendance_summary(p_student uuid, p_section uuid)`.
- Trigger: any insert into `notifications` → DB webhook (pg_net `net.http_post`) to `${APP_URL}/api/internal/push-dispatch` with `X-Webhook-Secret`. Store APP_URL and the secret in a `private.app_config` table readable only by `postgres`, NOT hardcoded in migrations.
- Trigger: audit every UPDATE on `attendance`, `enrollments`, `face_profiles`, `section_staff`.

RLS: write policies for every table and role: student = own rows; professor = sections in `section_staff`; admin = all; operator = devices/cameras/heartbeats only; anon = nothing. Realtime: enable on `attendance`, `occupancy_samples`, `notifications`, `verification_requests` with RLS-respecting access.

`seed.sql`: 1 department, 1 semester, 2 courses with 1 section each, room `B204` with a geofence polygon (placeholder near Sejong University; I will redraw it in the admin UI), timetable slots, 1 admin, 1 professor, 3 real student placeholders (I will sign up and you link them), 30 `is_simulated` students, 1 edge device (print its plaintext key once from `scripts/new-device-key.ps1`, never store it).

SQL tests in `supabase/tests/` (pgTAP via `npx supabase test db` if Docker is available; otherwise a `scripts/test-db.ps1` that runs SQL test files against the linked project inside a transaction that is rolled back). One test per row of the edge-case table in the spec, at minimum: on time, late, very late, camera miss + self-verify in the first window, left early via recheck, re-entry, duplicate event, offline replay with old `observed_at`, gate camera offline → finalize gives `pending` not `absent`, visitor (unknown), dropped student excluded from the gallery, cancelled session excluded from %.

**GATE 1:** migrations apply cleanly to the Supabase project from zero (`db reset` locally or a fresh branch); all SQL tests pass; RLS test: a student JWT cannot read another student's attendance; types generated into `apps/web/lib/database.types.ts`.

## PHASE 2 — Web app foundation: auth, roles, admin portal

- `create-next-app@latest apps/web` (TypeScript, App Router, Tailwind, ESLint, `src/` off), shadcn/ui, `@supabase/ssr`, `zod`, `react-hook-form`, `@tanstack/react-table`, `date-fns` + `date-fns-tz`, `papaparse`, `leaflet` + `react-leaflet` (geofence drawing), `sonner` (toasts).
- Supabase clients: browser client, server client (cookies), admin client (service role, server-only, in `lib/supabase/admin.ts` with `import "server-only"`).
- `middleware.ts`: refresh the session; route guard by role: `/admin/*` admin, `/operator/*` operator|admin, `/professor/*` professor, `/student/*` student.
- Auth pages: sign in, sign up (students; admin can also invite), password reset. Admin + operator: enable TOTP MFA enrolment page.
- Admin portal: dashboard; departments; semesters + holidays; courses; sections (assign professor/TA/substitute); rooms (code, floor, geofence drawn on a Leaflet map, require_qr); timetable; people (create/invite/deactivate, CSV import with a validation preview); enrollments (bulk, drop with an end date); face-enrollment status board (pending/active/review/rejected; approve/reject the review queue; force re-enroll); settings (policy defaults); audit log viewer; reports (by course/student/date, CSV export).
- Operator portal: devices + cameras (create device → show the key once; ROI polygon + entry line editor drawn on a snapshot image uploaded by the edge), health table (last heartbeat, fps, frame age, queue backlog).
- UI: clean, responsive, accessible; status badges with fixed colours (present green, late amber, absent red, left_early orange, excused blue, pending gray, SIM badge purple).
- Tests: Vitest for utils + zod schemas; Playwright e2e: admin creates a course → section → enrolls a student; a student cannot open `/admin`.

**GATE 2:** `npm run lint`, `typecheck`, `test`, `build` all pass; Playwright e2e passes against the dev server; screenshots of the admin pages saved to `docs/screenshots/`.

## PHASE 3 — PWA, push notifications, notification inbox, deploy

- `app/manifest.ts`, icons, `public/sw.js` (handles `push` → `showNotification` with `data.url`; `notificationclick` → focus/open the URL). Register the SW only in production and on `https://` or `localhost`.
- Generate VAPID keys (`npx web-push generate-vapid-keys`) → env. Subscribe flow with clear permission UX; on iOS show "Add to Home Screen first" instructions when not in standalone mode.
- `/api/internal/push-dispatch` (runtime `nodejs`), fan-out to all subscriptions of the user, TTL = request window length, cleanup of expired subscriptions.
- Student notification inbox page using Realtime on `notifications` (works even if push fails).
- Notification types + deep links: `enroll_face → /student/enroll`, `verify_now|recheck_now → /verify/{requestId}`, `marked_late|marked_absent|left_early → /student/attendance`, `appeal_update`, `low_attendance`, `class_cancelled`, `device_offline` (staff).
- Deploy to Vercel (tell me the exact steps and env vars); set `APP_URL` + the webhook secret in `private.app_config`.

**GATE 3:** on the deployed URL, enrolling a student creates an `enroll_face` notification and a real push arrives on my phone (I confirm). Lint/type/test/build pass.

## PHASE 4 — Face API + face enrollment + liveness

- `apps/face-api`: FastAPI, `insightface`, `onnxruntime`, `opencv-python-headless`, `numpy`, `python-multipart`, `uvicorn`. Load `FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])` once at startup with `det_size=(640,640)`. For each image: decode, reject if ≠ 1 face, face width < 80 px, Laplacian variance below a threshold (configurable), or `det_score` < 0.6; return `normed_embedding.tolist()`. Secret header check. `/health` returns model loaded + version.
- Windows install notes in its README (Python 3.11, C++ Build Tools if a wheel must compile, install `onnxruntime` first). Note the InsightFace model licence (non-commercial research) in README and PROGRESS.
- `scripts/start-face-api.ps1` starts uvicorn + `cloudflared tunnel` and prints the URL I must put in `FACE_API_URL`. (Prefer a named tunnel with a fixed hostname; document the quick-tunnel fallback.)
- Student enrollment page `/student/enroll`: consent screen (versioned text stored in `biometric_consents`); camera via `getUserMedia({ video: { facingMode: "user" } })`; MediaPipe Face Landmarker (`@mediapipe/tasks-vision`, VIDEO mode) for live guidance (one face, centred, size, brightness); a random liveness sequence of 3 from {blink, turn left, turn right, smile} using blendshapes (`eyeBlinkLeft/Right`, `mouthSmileLeft/Right`) and head yaw from the facial transformation matrix; then auto-capture 2 frames each for front/left/right/up/down; upload to `/api/face/enroll`.
- Self-tests: pytest for the face-api using small test images (generate synthetic negatives: no face, two faces, blurred); Vitest for the liveness state machine with mocked landmark streams.
- `scripts/face-eval.py`: given a folder `eval/<person>/*.jpg`, prints the genuine vs impostor similarity distributions and suggested thresholds (FAR/FRR table). Save the output to `docs/face-eval.md`.

**GATE 4:** pytest + vitest pass; the face-api runs locally and through the tunnel; I enroll on my phone; `face_profiles.status = active` with ≥ 5 embeddings; the duplicate check flags a second account enrolled with my face (I test).

## PHASE 5 — Edge node (gate pipeline) + MQTT + ingest + simulator

- `apps/edge` (`config.yaml`: room code, device key, API base URL, MQTT, cameras `{kind, source}` where source = MJPEG URL | webcam index | video file path, ROI polygon, entry line, thresholds).
- `camera.py`: threaded reader that keeps only the latest frame; reconnect with exponential backoff; emits `CAMERA_OFFLINE/ONLINE`; supports video files at real-time speed for repeatable tests.
- `gate.py`: InsightFace detect+embed on frames (process every Nth frame, configurable); IoU/ByteTrack-style tracking of face boxes → `track_id`; line-crossing direction from the track centroid history; per-track vote buffer; decision rule = ≥ `gate_min_votes` crops agree, best ≥ accept threshold, best − second ≥ margin, else `GATE_ENTRY_UNKNOWN`; dedupe already-marked students for the session; publish feedback to the ESP32 topic.
- `gallery.py`: fetch on session start / `reload_gallery`; keep in RAM as a normalised numpy matrix; cosine = matrix @ vector; wipe on stop.
- `queue.py`: SQLite outbox (every event is written before publishing; marked sent on PUBACK); replay on reconnect; keeps the original `observed_at`.
- `heartbeat.py`: every 15 s (cpu %, fps per camera, last frame age, outbox size).
- `apps/ingest`: paho-mqtt subscriber (QoS 1, persistent session) → batch POST to `/api/edge/v1/events` (≤ 1 s or 100 events), retry with backoff; polls the current session and publishes `control` commands.
- `apps/simulator`: CLI `python -m simulator run --room B204 --script demo.yaml` publishing realistic events for simulated students (on-time arrivals, late arrivals, one leaves early, unknown visitor), plus occupancy samples. Everything has `simulation: true`.
- `infra/mosquitto/mosquitto.conf`: `listener 1883`, `allow_anonymous false`, `password_file`, `acl_file`; `scripts/new-device-key.ps1` creates the device row + MQTT user.
- `scripts/start-classroom.ps1`: starts mosquitto, face-api (+ tunnel), ingest, edge — each in its own window with logs in `logs/`.
- Tests: pytest for line-crossing, voting/decision rule, dedupe, outbox replay/idempotency (fake MQTT broker or paho in-memory mock), and envelope schema validation (pydantic).

**GATE 5:** pytest passes for edge/ingest/simulator; the simulator run makes 30 simulated students appear with the correct statuses in the DB; a recorded video in `apps/edge/samples/` (I record it; you give me instructions) produces a recognised entry; LIVE: I walk past phone #1 and my status becomes `present` (I confirm). Report measured latency (observed_at → DB updated_at).

## PHASE 6 — Occupancy, professor live dashboard, mismatch flow, self-verify

- `occupancy.py`: Ultralytics `YOLO("yolov8n.pt")`, `classes=[0]`, conf ≥ 0.4, every `inside_interval_s` (default 3 s); keep boxes whose bottom-centre is inside the seat ROI (`cv2.pointPolygonTest`); median over a `deque(maxlen=10)`; `stable` = unchanged for `stable_count_seconds`; publish `OCCUPANCY_UPDATED` every 10 s. Optional debug window drawing the ROI + boxes (`--debug`).
- Professor portal: today's sessions; live session page with Realtime (roster table with status badges + method + first-seen time + re-entry/OUT markers; big counters Verified V / Counted C / Enrolled; mismatch banner; device health chips; buttons: Send verify request, Start recheck, Show room QR (full-screen page that refreshes every `qr_slot_seconds`), manual mark with reason, end session); the review queue (failed attempts, `pending` after finalize, unknown-entrant snapshots if enabled); session report + CSV.
- Self-verify page `/verify/[requestId]`: countdown; steps: location (`enableHighAccuracy`, timeout 15 s, show accuracy) → QR scan (`html5-qrcode`, rear camera) → face + liveness (front camera, same MediaPipe module) → submit → clear pass/fail reasons; max 3 attempts, then a "Request manual check" button.
- Server: QR HMAC verification in constant time (`crypto.timingSafeEqual`); geofence check via RPC; face 1:1 via face-api `/embed` + `match_face` RPC.
- Tests: Vitest for QR token generation/validation (slot edges), the geofence helper, the verify decision function; Playwright for the professor live page with seeded data (Realtime update appears without reload).

**GATE 6:** with the simulator: C > V triggers `verify_now` notifications only to `pending` students in the session; LIVE: I hide my face at the gate, get the push, verify with QR + face, and become `present` with method `self_verify` (I confirm); a printed photo fails liveness (I confirm). All tests pass.

## PHASE 7 — Recheck, finalize, appeals, student portal, reports

- Recheck: auto-open at end − N when count < verified − tolerance (professor gets an alert with a one-tap "Run recheck now" / "Skip"); manual trigger; push to present/late students; on close, non-passers → `left_early` (+ evidence + audit); show gate OUT events next to names.
- Finalize per fail-safe rules; lock after 48 h; professor edits only before lock (with reason); appeals after lock within `appeal_days`.
- Student portal: today/next class card; attendance per course (%, calendar heatmap, history with method + evidence summary); appeal form (reason + file to a private bucket, signed URLs); notification settings + devices; re-enrollment request; withdraw-consent flow (deletes embeddings, sets status `deleted`, switches the student to the non-biometric path).
- Reports: course %, at-risk list (below warn thresholds) with notifications, CSV + printable PDF (browser print stylesheet).
- Tests: SQL tests for recheck/finalize/lock/appeal; Playwright: student files an appeal → professor approves → status `excused`/changed + audit row.

**GATE 7:** the full simulator `demo.yaml` (30 students + scripted late/leave/visitor) ends with exactly the expected statuses (assert in a test); all lint/type/tests/build pass.

## PHASE 8 — ESP32, hardening, observability, docs

- `firmware/esp32-door-led/esp32-door-led.ino`: WiFi + PubSubClient, subscribe `campus/B204/gate/feedback`, green LED 1.5 s on `ok`, red on `unknown`, reconnect logic, credentials in `secrets.h` (gitignored, with `secrets.example.h`). Wiring note in the README (GPIO + 220 Ω resistors).
- Security pass: verify RLS on every table with a script that tries forbidden reads/writes per role; rate limits on `/api/verify/*`, `/api/face/enroll` and the edge APIs (Upstash-free approach: a Postgres-based counter table, or in-memory per instance documented as a limitation); security headers (CSP allowing the camera/MediaPipe WASM); MFA enforced for admin/operator.
- Privacy: retention jobs (`pg_cron`): delete unknown-entrant snapshots after 24 h, raw enrollment photos after N days, verification frames immediately after matching (store only scores).
- Observability: the operator health page; structured JSON logs in the Python apps; `PROGRESS.md` troubleshooting section (camera stream drop, IP change, tunnel URL change, push not arriving on iOS, InsightFace install).
- Docs: `README.md` quick start (fresh laptop → running demo), `docs/DEMO_SCRIPT.md` (10-step live demo from the spec), `docs/CISCO_LAYERS.md` (each layer → exact files/services/protocols), `docs/TESTING.md` (how to run every test + the metrics table filled from `face-eval` and occupancy MAE runs).
- `scripts/reset-demo.ps1`: reset the demo data to seed state in one command before a presentation.

**GATE 8 (Definition of Done):**
1. A fresh clone + README steps reach a running system.
2. All automated tests pass (SQL, Python, Vitest, Playwright), lint + typecheck + build are clean.
3. The live 10-step demo script works end to end with my phones and laptop (I confirm each step).
4. Cutting the Wi-Fi for 1 minute mid-session loses no events (outbox replay verified in the DB).
5. `docs/CISCO_LAYERS.md` maps every component to a layer.

---

Start now with PHASE 0. Read `CLAUDE.md` and `docs/ARCHITECTURE.md` first, then tell me in a short list what you understood the system to be, any contradictions you found, and the exact accounts/keys you need from me.
