# Cisco IoT 7-layer model → AttendIQ

Every runtime component, with the exact files, services and protocols. Data flows up (L1 → L7); commands flow down
(professor "recheck" → push → phone; ingest `control` → edge; edge `feedback` → ESP32).

| Layer | Component | Files / service | Protocol / interface |
|---|---|---|---|
| **L1 Physical devices & controllers** | Gate camera: Android phone #1 running IP Webcam | phone app; consumed by `apps/edge/edge/camera.py` | MJPEG over HTTP (`http://<phone>:8080/video`), portrait -> `gate.rotate: 90` |
| | Inside camera: laptop webcam (or phone #2) | `apps/edge/edge/camera.py` (`INSIDE_CAMERA_SOURCE=0`) | DirectShow / MJPEG |
| | Student smartphones (front + rear camera, GPS) | browser PWA (`apps/web/app/student/enroll`, `apps/web/app/verify/[requestId]`) | `getUserMedia`, Geolocation API |
| | ESP32 door LED (actuator) | `firmware/esp32-door-led/esp32-door-led.ino` | MQTT subscribe `campus/<room>/gate/feedback` |
| **L2 Connectivity** | Campus Wi-Fi / LAN | laptop, phones, ESP32 on one network | IPv4, Wi-Fi |
| | MQTT broker (Mosquitto, per-device users + room ACL) | `infra/mosquitto/mosquitto.conf`, `infra/mosquitto/acl`, `passwd` (gitignored) | MQTT 3.1.1, QoS 1 for events (QoS 0 LED feedback), retained `control` |
| | Topics | `packages/pycommon/attendiq_common/topics.py` | `campus/<room>/gate/event`, `inside/occupancy`, `device/heartbeat`, `gate/feedback`, `control` |
| | Edge ↔ cloud | `apps/ingest` → `apps/web/app/api/edge/v1/*` | HTTPS + `Authorization: Bearer <device key>` (SHA-256 hashed in `edge_devices`) |
| | Face API exposure | `scripts/start-face-api.ps1` | Cloudflare Tunnel (HTTPS), `X-Face-Api-Secret` |
| | Phones / dashboards ↔ cloud | Vercel + Supabase | HTTPS, WebSocket (Supabase Realtime), Web Push (VAPID → FCM/APNs) |
| **L3 Edge (fog) computing** | Gate pipeline: SCRFD detection + ArcFace embeddings, IoU tracking, entry line / presence, vote over crops, per-session dedupe | `apps/edge/edge/{detector,tracker,geometry,gate,decision,gallery}.py` | in-process; gallery in RAM only during a session |
| | Occupancy: YOLOv8n persons, seat ROI by feet point, median of 10, 60 s stability | `apps/edge/edge/occupancy.py` | publishes `OCCUPANCY_UPDATED` every 10 s |
| | Reliability: SQLite outbox (write before publish, replay on reconnect), camera reconnect backoff, heartbeat, server clock offset correction | `apps/edge/edge/{outbox,camera,__main__}.py`, `attendiq_common/api.py` | `EDGE_HEARTBEAT` every 15 s |
| | Ingest: MQTT → batched HTTPS, ack only after the server stored it | `apps/ingest/ingest/{batcher,sessions,__main__}.py` | persistent MQTT session, ≤ 1 s / 100 events per POST |
| | Face embedding service (stateless) + passive anti-spoofing | `apps/face-api/app/{engine,quality,main}.py` | `POST /embed`, `GET /health` |
| **L4 Data accumulation** | PostgreSQL 17 (Supabase): people, timetable, sessions, attendance, evidence, events, verification, appeals, audit | `supabase/migrations/*.sql`, `supabase/seed.sql` | SQL |
| | pgvector face embeddings (HNSW cosine index) | `face_embeddings`, `face_profiles.template` | `match_face`, `match_face_any` |
| | Supabase Storage (private buckets) | `face-review` (review thumbnails), `appeal-files`, `camera-snapshots` | Storage API, signed URLs |
| | Edge-local buffer | `apps/edge/data/outbox.db` (SQLite) | — |
| **L5 Data abstraction** | Row-Level Security on every table, `security_invoker` views, role helpers | `20261117165808_auth_helpers_rls.sql`, tested by `supabase/tests/rls_matrix.test.sql` | Postgres RLS + JWT claims |
| | Rule engine (attendance status, mismatch, recheck, finalize, lock) | `apply_edge_events`, `record_evidence`, `run_count_checks`, `apply_self_verification`, `finalize_session`, `session_tick` (pg_cron every minute) | RPC |
| | Reporting / normalisation | `attendance_summary`, `current_session_for_room`, `session_gallery`, `rooms_geo` | RPC / views |
| | Privacy retention | `privacy_retention` (pg_cron daily 03:00 KST) + `/api/internal/retention` | pg_net webhook |
| **L6 Application** | Admin portal (setup, people, enrollments, faces, reports, audit, settings) | `apps/web/app/admin/*` | Next.js App Router (Vercel) |
| | Professor live dashboard (V / C / enrolled, mismatch banner, devices, roster, room QR, recheck, manual marks, review queue) | `apps/web/app/sessions/[id]/*` | Realtime `postgres_changes` |
| | Student PWA (enrollment with liveness, self-verify, attendance, appeals, settings) | `apps/web/app/student/*`, `apps/web/app/verify/*` | PWA + Web Push |
| | Operator portal (devices, cameras, ROI, health) | `apps/web/app/operator/*` | — |
| | APIs | `apps/web/app/api/{edge,face,verify,sessions,reports,push,internal}/*` | REST/JSON, rate-limited (`rate_limit_hit`) |
| **L7 Collaboration & processes** | Attendance policy (present ≤ T0+10, late ≤ T0+30, verify windows, tolerance, left-early policy, appeal days, warnings) | `settings.policy`, `/admin/settings` | admin-editable |
| | Professor approvals: manual marks with a reason, appeal decisions | `manual_mark`, `decide_appeal`, `/professor/appeals` | audited (`audit_log`, by trigger) |
| | Student appeals with evidence | `file_appeal`, `/student/appeal` | notifications both ways |
| | Biometric consent (versioned, withdrawable, PIPA) | `biometric_consents`, `lib/consent.ts`, `/student/settings` | — |
| | Low-attendance warnings to students | `notify_at_risk`, `/professor/reports` | push + inbox |
