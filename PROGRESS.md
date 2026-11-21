# PROGRESS

Last updated: 2026-11-19

## Phase status

| Phase | Status | Gate |
|---|---|---|
| 0 Preflight | DONE (commit b0295a4) | tools ✅, skeleton ✅, .env.example per app ✅ |
| 1 Database | DONE (commit 1a130c2) | see Gate 1 below |
| 2 Web foundation | DONE (commit 5a4f6f0) | see Gate 2 below |
| 3 PWA + push + deploy | DONE (commit df75206) | see Gate 3 below |
| 4 Face API + enrollment | DONE (commit 85333a9) | see Gate 4 below |
| 5 Edge + MQTT + ingest + simulator | LIVE TEST PASSED — only the recorded-video check is open | see Gate 5 below |
| 6 Occupancy + live dashboard + self-verify | DONE (commit c53a737) | see Gate 6 below |
| 7 Recheck, finalize, appeals, reports | DONE (commit ea450a3) | see Gate 7 below |
| 8 ESP32, hardening, docs | BUILT — live demo partly done + Wi-Fi cut passed 2026-11-22; remaining demo steps open | see Gate 8 below |

## Gate 8 status (2026-11-19, demo update 2026-11-22) — Definition of Done

| # | Check | Result |
|---|---|---|
| 1 | Fresh clone + README reach a running system | ⏳ README quick start written (`README.md`), every step was exercised in this project, but **not replayed on a second, clean laptop** |
| 2 | All automated tests pass; lint + typecheck + build clean | ✅ SQL: rule_engine 95, manual_mark 9, appeals 19, **rls_matrix 13 (62 probes)**, **privacy_ops 9** · Vitest 114 · Playwright 10/10 (dev) and 10/10 against the **production build with CSP** (0 console errors on admin pages incl. the map) · pytest face-api 20, edge 31, ingest 7, simulator 11 (+ Gate 7 live), pycommon 5 · ruff, eslint, tsc, next build |
| 3 | Live 10-step demo works with the user's phones (user confirms each step) | 🟡 PARTLY DONE live on 2026-11-22 (production, user's Android phone, IOT401-01 ad-hoc session `98e2d2f0`): **gate** - walk-in recognised 1 s after the session opened (score 0.74, 5/5 votes) -> present; **recheck** - push delivered and opened within 6 s, QR + face 0.89 + server live 0.997 -> verified in 64 s, repeated (face 0.88, live 0.9998); **finalize** - session ended, 30 SIM students `needs_review` (not absent) because the inside camera was not healthy (fail-safe working); **appeal** - student filed `excused` (on the Nov 18 test session), professor approved with a note -> attendance `excused`, audit row by the professor with the reason, 'Appeal approved' push to the student. Second run (session `5886d997`, started 12 min in the past): **late** - gate recognised the user 12.0 min after T0 -> `late` (gate); **left early** - recheck opened, user ignored it -> at the next tick after the 4-min window `left_early`, flag `recheck_failed`; the session then ended by itself. Not done yet: count mismatch -> self-verify (step 5) - the laptop has NO webcam (device 0 only gave empty frames, count always 0); the inside camera is now a second phone (iPhone, IP Camera Lite, MJPEG `http://<ip>:8081/video`, login off, main = Back Camera; its picture-in-picture box is excluded with a non-rectangular ROI in the local `config.yaml`) - set up, not yet tested with a person; photo attack (7; printed-photo result from Gate 6 stands); ESP32 LED (no board). **Exit camera live test (2026-11-22, session `95d46ca6`):** phone 1 = way in, iPhone = way out (exit `mode: presence`, people counting off). Mahi and Fahim recognised by phone 1 -> present; the iPhone recognised Fahim leaving at 02:50:20 and he did not pass phone 1 again; on End session: Mahi present, Fahim **absent** (`left_no_return`, note 'left at 02:50 and did not come back'). Found on the way: phone 1 had been turned upside down (no faces found at rotate 90; fixed with `gate.rotate: 270` in the local config). Note: `Start recheck` from the live page did not create a request in this run; the request was opened with the same RPC as the admin user. Afterwards a new e2e test (`live-session.spec.ts`: click Start recheck, accept the confirm popup -> open recheck request) passed, so the button works; the demo failure was most likely the native `window.confirm` popup not being accepted. |
| 4 | Cutting the Wi-Fi for 1 minute loses no events | ✅ simulated: ingest pointed at an unreachable API for 60 s while a 115-event class was published (0 events reached the DB), then the ingest process was **killed** and restarted: the broker redelivered all unacked QoS 1 messages -> **112/112 unique events stored** (3 duplicates ignored), statuses correct, backlog drained in 6.5 s. Edge outbox replay after a broker outage was verified in Phase 5. ✅ **Literal Wi-Fi unplug done 2026-11-22** with the user: laptop Wi-Fi off ~1 min during a real-time simulator class (session `5fa60253`, MQTT -> ingest); ingest logged `post failed (getaddrinfo) ... retry, 20 queued`; after reconnect all 15 events observed during the outage (00:53:24-00:56:12 KST) were stored with their original `observed_at` (max delay 196 s), 0 duplicates, 0 rejected |
| 5 | `docs/CISCO_LAYERS.md` maps every component to a layer | ✅ |

### Phase 8 decisions / notes
- **Rate limits** (migration 15 `rate_limits` + `rate_limit_hit`, fixed window in Postgres so all Vercel instances share it): self-verify 10/min/student, manual-check 3/10 min, face enroll 5/h, every edge API 600/min/device. Fails open (logged) if the DB call itself fails.
- **CSP** (production builds only; dev needs eval): `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'` (MediaPipe WASM; no eval / new Function in MediaPipe or html5-qrcode — checked), Supabase https + wss, OSM tiles, blob workers, `frame-ancestors 'none'`, `object-src 'none'`; plus HSTS. `upgrade-insecure-requests` dropped (breaks the production build over local http; production is https-only + HSTS anyway). `'unsafe-inline'` scripts remain because Next's bootstrap is inline without nonces.
- **MFA**: with `ENFORCE_MFA=true` every admin/operator page, Server Action and staff API needs an `aal2` session; aal1 sessions are sent to `/account/security` to enroll TOTP or enter the code of an existing factor. Default off (dev + e2e). ⚠️ **Not yet enabled in production** — turning it on forces the admin accounts to set up an authenticator, so it needs the user's go-ahead.
- **Privacy retention** (`privacy_retention`, pg_cron daily 03:00 KST): unknown-entrant snapshot references after 24 h, rate-limit rows after 1 day, notifications after 90 days, heartbeats after 30 days; then `/api/internal/retention` (pg_net + webhook secret) removes face-review thumbnails once the profile left `review`, and appeal evidence 180 days after the decision. Verification frames are never stored (only scores). Raw enrollment photos are never stored.
- **RLS matrix** (`supabase/tests/rls_matrix.test.sql`): RLS on every table; policies on every table except the service-only `session_secrets`, `rate_limits`; all views `security_invoker`; anon reads 0 rows everywhere; per-role forbidden reads/writes (student, professor of another section, own professor, operator) all refused.
- **Demo reset**: `reset_demo()` (service only) + `scripts/reset-demo.ps1` (asks for `RESET`): deletes simulation + ad-hoc sessions with everything attached, clears device health and rate limits; keeps people, faces, timetable sessions, settings. Tested in a rolled-back transaction only.
- **ESP32**: `firmware/esp32-door-led/esp32-door-led.ino` (PubSubClient, GPIO 25 green / 26 red via 220 Ω, 1.5 s, WiFi + MQTT reconnect with backoff, `secrets.h` gitignored). **Not compiled or flashed** (no Arduino toolchain / board here).
- Admin -> Sections got **"Demo: class started 12 min ago"** for demo step 6 (late).
- Docs: `README.md` quick start, `docs/DEMO_SCRIPT.md`, `docs/CISCO_LAYERS.md`, `docs/TESTING.md` (all suites + measured metrics; gate FAR/FRR on a real multi-person set is still open).

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Edge log `camera gate OFFLINE` | Phone #1 asleep or IP Webcam stopped (start the server again), or its IP changed (DHCP): read the new address in the app, update `GATE_CAMERA_SOURCE` in `apps/edge/.env`, restart the edge. Keep the phone on a charger with the screen-off option of IP Webcam. |
| Faces never recognised, scores ~0.1-0.2 | Picture sideways: phone in portrait -> `gate.rotate: 90` in `apps/edge/config.yaml`. Or the gallery is stale (student re-enrolled): the edge refreshes every 60 s; force it with `reload_gallery` (ingest re-sends control) or restart the edge. |
| Laptop clock warning in the edge log | Windows clock is off; the edge corrects timestamps with the server offset, but sync it (Settings -> Time -> Sync now). |
| `face service is offline` on enroll / verify | face-api or its tunnel stopped: `scripts\start-face-api.ps1` (it publishes the new quick-tunnel URL itself via the edge device key). `curl <tunnel>/health` must show `"liveness": true`. |
| Port 1883 in use | The Mosquitto Windows service from the installer: run with `-MqttPort 1884`, or once in an admin PowerShell `Stop-Service mosquitto; Set-Service mosquitto -StartupType Manual`. |
| ESP32 never connects | Broker must listen on `0.0.0.0` (project config does), Windows Firewall must allow inbound TCP 1883 on the private network, user `esp32-B204` must exist in `infra/mosquitto/passwd`. |
| Push not arriving | Notifications on in Settings for that phone; Android: battery optimisation off for Chrome. **iOS**: only works for the app added to the Home Screen (iOS 16.4+), not in Safari tabs. Check `/notifications` (inbox works without push). Webhook secret mismatch -> `node scripts/rotate-webhook-secret.mjs` + redeploy. |
| `onnxruntime` / `onnx` DLL blocked on Windows | Windows Smart App Control must be off. |
| InsightFace pip install tries to compile | Use Python 3.11 (wheels exist); otherwise install "Desktop development with C++" Build Tools. |
| Self-verify fails with "looked like a picture" for a real face | Bad light / laptop webcam (low anti-spoof scores); use the phone camera in good light; `LIVENESS_THRESHOLD` (0.8) in `apps/face-api/.env`. |
| No verify push even though more people are inside | Only a **stable** count (unchanged 60 s) younger than 2 min counts, the first check is at T0+10, and `staff_count` (default 1) is subtracted. |

## Gate 7 results (2026-11-19) — PASSED

| Check | Result |
|---|---|
| **Full simulator `demo.yaml` ends with exactly the expected statuses (asserted in a test)** | ✅ `apps/simulator/tests/test_gate7_live.py` (`SIM_LIVE=1`): `simulator run --direct --finalize` replays the class (30 students: 20 on time, 5 late, 1 leaves at T0+50, 1 goes out and comes back, 3 no-shows, 1 unknown visitor, 3 duplicate events), the class ends 1 min later, pg_cron finalizes it, and every student is compared with the script: **state `ended`, 22 present, 5 late, 3 absent, gate_out/reentry flags exact, 1 unknown entry, 0 differences** (run twice) |
| SQL tests | ✅ rule engine 95 + manual_mark 9 + **appeals 19** (no appeal while live, reason required, own folder only, one open appeal, students cannot decide, RLS visibility, decision note required, decided once, approve -> excused/appeal audited with professor + reason, notifications both ways, locked session refuses manual edits but appeals still decide, at-risk warning once per 6 days, students cannot warn) |
| web vitest | ✅ 112 (new: next class in Asia/Seoul incl. ongoing + next week, 12-week heatmap worst-status-per-day, appeal eligibility) |
| Playwright e2e | ✅ 10/10 (new: student files an appeal -> professor approves on /professor/appeals -> `present` via `appeal` + audit row with the professor as actor; professor report + at-risk block + CSV + session CSV; student settings) |
| pytest simulator / pycommon | ✅ 11 (+1 live) / 5 |
| lint / typecheck / build | ✅ |

### Phase 7 decisions / notes
- Migration 14 (`20261118125607_appeals_at_risk`): `file_appeal` (student; finished class, within `appeal_days`, present/late/excused, reason >= 10 chars, attachment must be in the student's own folder, one open appeal per class; notifies staff), `decide_appeal` (staff/admin; note required; approval sets the status even after lock, method `appeal`, evidence + audit reason `appeal approved: <note>`; notifies the student), `notify_at_risk` (staff; students below the highest `warn_attendance_pct`, once per 6 days, simulated students excluded). Private bucket `appeal-files` (JPEG/PNG/PDF, 5 MB): students upload only into `<their id>/`, staff read attachments of their sections' appeals via 5-minute signed URLs.
- Lock: `session_tick` locks 48 h after the end; `manual_mark` refuses locked sessions (professor edits only before lock); after that, only appeals change a record.
- Recheck: the DB opens it automatically at T_end-10 when C < V - tolerance and tells the professor ("Recheck started"); the professor can also start one any time from the live page. The spec's "Run recheck now / Skip" prompt is replaced by this automatic open + manual button (simpler, same outcome).
- The scripted leaver (#26) stays `present` with a `went out` marker: in the demo the visitor keeps C >= V - tolerance, so no recheck fires; the professor sees the OUT marker next to the name and can mark `left_early` manually (audited).
- Student portal: home (next/ongoing class card from the timetable, open "verify now" banner), `/student/attendance` (per course % from `attendance_summary`, 12-week heatmap, history with method + first seen + markers + professor notes, appeal links and appeal states), `/student/appeal` (status requested, reason, optional evidence upload straight to the private bucket), `/student/settings` (push toggle, devices with remove, re-enrollment request -> admins notified, withdraw consent).
- Professor: `/professor/appeals` (open queue with evidence links, approve/reject with a note, decided list), `/professor/reports` (per section, at-risk list + "Warn at-risk students", CSV via `/api/reports/export`, Print / PDF via the browser with a print stylesheet), session CSV + print on the session page after the class.
- Simulator: `--finalize` + `GET /api/edge/v1/sessions/{id}/results` (simulator key, simulation sessions only) so the Gate 7 check reads the final state without DB credentials.

## Gate 6 results (2026-11-18) — PASSED after the anti-spoofing fix

| Check | Result |
|---|---|
| **Simulator: C > V sends verify_now only to pending students** | ✅ `scripts/mismatch.yaml` (gate camera "misses" 3 students who are inside) + live count held 3 min: at 12:11:00 the pg_cron tick saw C = 28 > V = 25 and opened one `mismatch` request whose targets are exactly the 5 pending students (26-30), 0 present/late targets. Simulated students get no notification rows by design (`notify_user` skips them); pgTAP test D covers the real-student notifications |
| web vitest | ✅ 103 (new: rotating QR token incl. slot edges/forgery/wrong session, verify decision rule, live counters/mismatch banner) |
| Playwright e2e | ✅ 9/9 (new: live session page shows counters + roster and a gate event turns a row Present **without reload** via Realtime; room QR renders; verify/QR APIs refuse anonymous callers) |
| SQL tests | ✅ 95/95 rule engine + **9/9 `manual_mark`** (no-JWT refused, other professor refused, student refused, reason required, `pending` not settable, audited with professor as actor + reason, evidence row, student notified) |
| edge / ingest / simulator / pycommon pytest | ✅ 31 / 7 / 9 / 5 (new: seat-ROI by bottom-centre, median smoothing, stability timer, **real YOLOv8n on a 6-person photo**) · ruff clean |
| lint / typecheck / build | ✅ |
| **LIVE: hide face at gate -> push -> verify with QR + face -> `present` (self_verify)** | ✅ session 171eaa06 (T0 set 9 min back, staff_count 0): the laptop webcam (inside camera, YOLOv8n) counted 1 stable person, the 12:26:00 tick found C 1 > V 0 and opened a `mismatch` request -> `verify_now` push to the user's phone -> room QR scanned from the professor's projector page -> **`present`, method `self_verify`, 12:29:05** (first mismatch window); face 0.90, QR ok, GPS ±20 m but outside the placeholder B204 polygon (QR carried it) |
| **LIVE: a printed photo fails liveness** | ✅ after a fix. **First build FAILED**: the printed photo passed (session 66156444, 12:32:02, face 0.885) because the browser challenges can be faked (covering the photo's eyes = blink) and the server trusted the browser flag; that spoofed `present` row is left as evidence. **Fix** (commit 9c370ae): server-side passive anti-spoofing (InsightFace `liveness.onnx`) on every uploaded frame; verify needs browser challenges AND a server `live` verdict. **Re-test**: (1) twice the print was stopped by the browser challenges before any upload (no attempt rows, no server logs); (2) the server model on 59 webcam frames of the printed photo: live_score 0.000-0.27 (median ~0.01), **0/59 accepted**; (3) the user's real face through the phone in self-verify: **live_score 0.9991 -> pass** (session 3e53674f, 12:51:52, face 0.888, QR ok, `late` because it was a professor-sent window at T0+14) |
| Real face on the LAPTOP webcam | ⚠️ median live_score ~0.7, only ~half the frames >= 0.8 (dim, soft image). Self-verify uses the phone camera (0.998-0.999), so this matters only if verification were ever done on a laptop. Threshold stays 0.8 (`LIVENESS_THRESHOLD`) |

### Phase 6 decisions / notes
- **Anti-spoofing after the failed photo test:** face-api 1.1.0 loads InsightFace's official passive liveness addon (`models/addons/liveness.onnx`, 1.5 MB, downloaded once from deepinsight's GitHub release with the SHA-256 InsightFace pins) in `observe` mode and returns `live` + `live_score` per image (threshold 0.8, `LIVENESS_THRESHOLD`). `/health` reports `liveness`. Next.js requires it unless `FACE_REQUIRE_LIVENESS=false` (dev only).
- Self-verify = `/verify/[requestId]`: GPS (high accuracy, 15 s) -> rear-camera QR scan (html5-qrcode 2.3.8) -> front camera 2-step random liveness (same MediaPipe module as enrollment) -> one straight-on JPEG -> `POST /api/verify/[requestId]`. Server: window open + eligible (target, or pending in a non-recheck window) + max 3 attempts + face profile active, face-api `/embed` + `match_face` >= `verify_threshold` (0.50), QR HMAC (current or previous 20 s slot, `timingSafeEqual`), PostGIS `check_geofence`, rule face AND liveness AND (QR OR GPS-inside-and-accurate), QR mandatory when `rooms.require_qr`. Attempt stored in `verification_attempts`; a pass goes through `apply_self_verification` (camera-miss rule: first mismatch window = present). "Request manual check" flags the row `manual_check` and notifies the staff.
- QR token format `aiq1.<session>.<slot>.<base64url HMAC>`; the projector page (`/sessions/[id]/qr`) gets tokens from the server (server time; it corrects for a wrong laptop clock) and redraws on rotation.
- Live session page `/sessions/[id]` (professor of the section or admin; route guard + RLS): V / C / Enrolled, mismatch banner (same rule as `run_count_checks`, stable counts only), device health chips (edge heartbeat + gate camera frame age, read with the service role after RLS proved staff access), open windows, roster with method / first seen / went-out / re-entered / manual-check markers, manual mark with mandatory reason (migration 12 `manual_mark`), send verify request (kind `manual`), start recheck, end session (`finalize_session`), review queue (failed attempts with reasons, manual-check requests, needs-review rows). Updates via Realtime (attendance, occupancy_samples, verification_requests) -> `router.refresh()`. Linked from the professor home and the admin dashboard.
- Occupancy: `edge/occupancy.py` YOLOv8n (Ultralytics 8.4.215, CPU torch 2.15.0) every 3 s on the inside camera, persons whose **bottom-centre** is inside the seat ROI, median of 10, stable after 60 s unchanged, `OCCUPANCY_UPDATED` every 10 s; `--debug` writes `data/inside-debug.jpg` (opencv-headless has no window). Weights in `apps/edge/models/yolov8n.pt` (gitignored).
- The DB only trusts a stable count <= 2 min old, so the simulator got `--hold-minutes` (live count) and `missed: true` students (inside but not recognised). The simulator now also uses the server clock offset (the laptop clock is ~2.5 min slow).
- Not built yet (Phase 7): session report + CSV, unknown-entrant snapshots.

### Phase 6 versions
qrcode 1.5.4 (+ @types/qrcode 1.5.6) · html5-qrcode 2.3.8 · ultralytics 8.4.215 · torch 2.15.0+cpu / torchvision 0.29.2+cpu · YOLOv8n weights v8.4.0 release

## Gate 5 status (2026-11-18) — live test passed

| Check | Result |
|---|---|
| pytest edge / ingest / simulator / pycommon | ✅ 25 / 7 / 7 / 5 (edge: line crossing, IoU tracker, voting rule incl. ambiguous + tied votes, dedupe + re-entry, outbox offline replay + idempotency + restart, camera offline/online + backoff, gate pipeline walk-in/out/stranger/small faces/presence mode, **2 tests on the real buffalo_l model**: enrolled face walking in -> RECOGNISED (score > 0.6), stranger -> UNKNOWN) · ruff clean |
| web lint / typecheck / vitest / build | ✅ / ✅ / 89 / ✅ |
| **Simulator: 30 simulated students get the correct statuses in the DB** | ✅ twice: over HTTP (`--direct`) and over the real IoT path simulator -> Mosquitto -> ingest -> API -> DB: 30/30 statuses (22 present, 5 late, 3 pending) and 30/30 flags (gate_out, reentry); 112 events stored, 3 duplicate event_ids ignored, unknown visitor logged, 0 real students touched |
| Edge process end to end (video file -> InsightFace -> MQTT + outbox -> ingest -> DB) | ✅ MQTT control `start` -> gallery fetched (RAM only) -> IN + UNKNOWN + camera online/offline + heartbeat stored via ingest-B204; outbox drained (0 unsent). Synthetic video (sample photo face), not a real recording |
| Device auth boundaries | ✅ no/bad key 401; simulator key on gallery 401; edge key on demo-session 401; other room 403; > 500 events 400 |
| Broker ACL | ✅ wrong password refused; simulator publishing `control` dropped; ingest `control` delivered to edge |
| Recorded video in `apps/edge/samples/` -> recognised entry | ⏳ NOT VERIFIED — needs the user's recording (instructions: `apps/edge/samples/README.md`) |
| **LIVE: user walks past phone #1 -> `present`** | ✅ 11:52:03 UTC, session 2a62dd17 (ad-hoc, IOT401-01, B204): phone #1 (IP Webcam, portrait -> `rotate: 90`, `entry_mode: presence`) -> edge -> Mosquitto -> ingest -> production API -> `attendance.status = present`, method `gate`, 9.4 min after T0, score 0.78, 5/5 crops agree |
| **Latency observed_at -> DB** | ✅ **0.99 s** (edge clock corrected by +154 s to server time) |
| SQL tests after migrations 10 + 11 | ✅ 95/95 (2 new: a second sighting without an OUT is not a re-entry) |

### Problems found by the live test (fixed)
- **Sideways stream:** IP Webcam on a phone held in portrait streams the landscape sensor image, so no face was detected upright. Added `gate.rotate` (0/90/180/270) and `--rotate`; phone #1 needs 90.
- **Stale gallery:** the student re-enrolled mid-session (consent withdrawn 11:47:25 -> re-enrolled 11:49:33); the edge still held the old faces (score 0.16 -> "unknown"). The edge now refreshes the gallery every 60 s (`gallery_refresh_seconds`) and on `reload_gallery` WITHOUT clearing who is already marked. After the refresh: recognised at 0.78 within 1 s.
- **False re-entry flag:** an edge restart re-reported a student standing in view and the server flagged `reentry`. Migration 11 (`20261118115427_reentry_requires_gate_out`): re-entry only after a gate OUT for that student. The flag on the live-test row (session 2a62dd17) was created before the fix and is left as is.
- **Face service offline:** the face-api/tunnel stopped when the earlier Claude session ended; `start-face-api.ps1` now publishes the new tunnel URL by itself through `POST /api/edge/v1/face-api-url` (edge device key), verified.

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
- Simulator: `cd apps\simulator; .\.venv\Scripts\python.exe -m simulator run` (MQTT) or `... run --direct` (HTTP); Gate 7 check: `... run --direct --finalize` or `$env:SIM_LIVE='1'; .\.venv\Scripts\python.exe -m pytest tests\test_gate7_live.py`.
- Face API + tunnel: `powershell -ExecutionPolicy Bypass -File scripts\start-face-api.ps1` (keep the window open while students enroll).
- Face threshold eval: `apps\face-api\.venv\Scripts\python.exe scripts\face-eval.py eval --out docs\face-eval.md`.
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
12. Decide when to set **`ENFORCE_MFA=true` in Vercel** (admin/operator two-factor); before that, set up TOTP for your admin account on `/account/security`.
