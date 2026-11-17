# Smart Attendance System — IoT Architecture & Project Plan

Nov 18, 2026 · @tushar

## Overview

A camera at the classroom door marks students present by face recognition. A second camera inside the room counts how many people are actually there. When the two numbers disagree, the system asks the unmarked students to prove they are in the room with their own phone: a face check plus a location check. Near the end of class it re-counts, catches anyone who left early, and triggers a re-verification round.

The system has three user roles and four runtime parts:

- **Admin** creates courses, sections, rooms and timetables, enrolls students, assigns professors, and triggers face enrollment.
- **Professor** runs the live class dashboard, sees counts and mismatches, launches re-verification, and edits or approves attendance.
- **Student** enrolls their face once, receives push alerts, self-verifies when asked, and tracks their own record and appeals.
- **Edge node** is a laptop in the classroom. It reads the gate and inside camera streams and runs face recognition and person counting locally. It sends only events (not video) to the cloud.
- **Cloud backend** (Supabase) holds users, courses, face embeddings, sessions and attendance. It runs the attendance rules, sends events to dashboards in real time, and stores the audit log.
- **Web app / PWA** (Next.js) is one app with three role-based portals. Students install it on their phones to get push notifications and use the phone camera and GPS.
- **Notification service** sends Web Push (via FCM/VAPID), with an in-app inbox as fallback.

The core rule is that the system never trusts a single signal. The gate camera says who entered. The inside camera says how many are present. The student's phone confirms identity and location. Attendance is final only when these agree, or when the professor overrides with a reason that is logged.

## Cisco IoT 7-layer reference model

Every part of the system maps onto one of Cisco's seven IoT World Forum layers. Data moves up from the cameras (L1) to people and policy (L7). Commands move back down, for example "start recheck" or "camera on".

| Layer | Cisco definition | In this system |
| --- | --- | --- |
| L1 Physical devices & controllers | Sensors, actuators, endpoints | Gate camera (Android phone via DroidCam/IP Webcam), inside camera (laptop webcam or second phone), student smartphones (front camera + GPS), optional ESP32 door sensor or buzzer |
| L2 Connectivity | Transport between devices and processing | Campus Wi-Fi/LAN. RTSP/MJPEG over HTTP for camera to edge, MQTT (Mosquitto) for edge events, HTTPS/WebSocket for edge to cloud and for phones |
| L3 Edge (fog) computing | Turn raw data into information close to the source | Python edge service on the classroom laptop: face detection + recognition (InsightFace), person counting (YOLOv8n + ByteTrack), entry-line logic, deduplication, offline buffer |
| L4 Data accumulation | Store data at rest | Supabase Postgres (+ pgvector for face embeddings), Supabase Storage (enrollment photos, evidence snapshots), local SQLite queue on the edge node |
| L5 Data abstraction | Reconcile, normalise, index, secure access | Postgres views + RPC functions (session roster, live counts, mismatch), Row-Level Security per role, materialised attendance summaries |
| L6 Application | Reporting, analytics, control | Next.js portals (Admin / Professor / Student), live dashboard via Supabase Realtime, attendance rule engine (Edge Functions + pg\_cron), reports and CSV/PDF export |
| L7 Collaboration & processes | People and business processes | University attendance policy (late/absent thresholds), professor approvals, student appeals, admin audit, privacy consent workflow, low-attendance warnings to advisors |

## System architecture

```text
L1 Devices:  [Gate cam: phone #1, IP Webcam MJPEG] [Inside cam: webcam/phone #2] [ESP32 LED] [Student phones: camera, GPS, QR]
                 | MJPEG over Wi-Fi          | frames                ^ MQTT feedback       |
L3 Edge laptop:  [Gate pipeline: SCRFD+ArcFace, vote] [Occupancy: YOLOv8n+median] -> [SQLite queue + Mosquitto]
                 [Face API: FastAPI+InsightFace, exposed via Cloudflare Tunnel]      | events (MQTT/TLS)   | HTTPS self-verify / enroll
L4-L6 Cloud:     [Ingest worker -> Postgres(pgvector, RLS)] <- [Edge Functions / pg_cron rules] -> [Realtime] ; Web Push
L6-L7 Apps:      Next.js PWA on Vercel: [Admin portal] [Professor dashboard] [Student PWA]
```

Video never leaves the classroom. The edge laptop turns the camera streams into small events and sends them over MQTT to the ingest worker, which writes them to Postgres. Edge Functions apply the attendance rules on a `pg_cron` schedule and send push notifications. Student phones talk to the cloud directly over HTTPS for enrollment and self-verification. Dashboards stay live through Supabase Realtime.

| Component | Responsibility | Runs on |
| --- | --- | --- |
| Gate pipeline | Detect, track, line-cross, recognise, vote → `gate_event` | Edge laptop |
| Occupancy pipeline | Count people in the seat area → `occupancy_sample` | Edge laptop |
| Queue + broker | Offline buffer, MQTT publish, receive control commands | Edge laptop |
| Ingest worker | Validate device, deduplicate, call `apply_gate_event` | Small Node/Python worker (edge laptop or cloud) |
| Postgres + pgvector | All data, embeddings, RLS, views, RPCs | Supabase |
| Edge Functions + pg\_cron | Session timers, mismatch and recheck rules, notifications. The Python Face API (FastAPI + InsightFace) handles enrollment embeddings and 1:1 self-verify matching; for the prototype it runs on the edge laptop behind a Cloudflare Tunnel | Supabase |
| Realtime | Push table changes and count updates to open dashboards | Supabase |
| Next.js PWA | Admin, Professor and Student portals; service worker for push | Vercel |

## Hardware & camera setup

The whole prototype runs on hardware you already own: two phones, a laptop and the students' phones. All of it sits on the same Wi-Fi network.

| Device | Role | How it connects | Placement & settings |
| --- | --- | --- | --- |
| Phone #1 | Gate (entry) camera | **IP Webcam** (Android) streams MJPEG at `http://<phone-ip>:8080/video`. Or **DroidCam** over USB/Wi-Fi, which shows up as a webcam on the laptop | Inside the room, facing the door at about 1.7 m height, 1.5–3 m from the doorway. 720p, 15–20 fps. Light coming from behind the camera, not behind the people entering |
| Laptop webcam *or* Phone #2 | Inside (occupancy) camera | Built-in webcam = OpenCV device 0. Phone #2 uses IP Webcam on another port | High corner at the front or back, wide view of every seat. One frame every 2–3 s is enough for counting |
| Classroom laptop | Edge node (fog layer) | Runs the edge service. Fixed LAN IP. Keep it plugged in | 8 GB RAM minimum, 16 GB recommended. CPU with ONNX Runtime is fine for one room; a GPU is optional |
| Student phones | Personal verification device | Installed PWA over HTTPS. Uses the front camera and Geolocation API | Android Chrome, or iOS Safari 16.4+ with the app added to the Home Screen (needed for push on iPhone) |
| Projector / TV *(optional)* | Presence beacon | Shows a rotating QR code from the professor dashboard | A second proof of presence that works where GPS is weak indoors |
| ESP32 + LED/buzzer *(optional, adds IoT credit)* | Door feedback actuator | Subscribes to MQTT `room/{id}/gate/feedback` | Green = recognised, red = unknown. Lets students know immediately whether they were marked |

**Camera tips that make or break accuracy:**

- Each face should be at least about 80 px wide in the gate frame. If faces are smaller, move the phone closer to the door.
- Have students pass through the door one or two at a time. A short "look at camera" sticker by the door helps a lot.
- Lock the phone's exposure and focus in the streaming app, and turn off auto-sleep.
- The inside camera only counts people; it does not recognise them. Faces across a classroom are too small and turned away for reliable recognition with a webcam.

## Tech stack

The stack is Next.js + Supabase for the product and Python for the edge AI. Everything is free or open-source at prototype scale.

| Area | Choice | Why |
| --- | --- | --- |
| Web app (all 3 portals) | Next.js 15 (App Router), TypeScript, Tailwind, shadcn/ui | One codebase, role-based routes, server actions |
| PWA & push | `next-pwa` / service worker + Web Push (VAPID) or Firebase Cloud Messaging | Push on Android and iOS 16.4+ without building a native app |
| Auth | Supabase Auth (email + university SSO later) | Roles stored in `profiles.role`, enforced with RLS |
| Database | Supabase Postgres + `pgvector` | Stores relational data and 512-d face embeddings in one place |
| Realtime | Supabase Realtime (Postgres changes + broadcast channels) | Live counts and alerts on the professor dashboard |
| Server logic | Supabase Edge Functions (Deno) + Postgres RPC + `pg_cron` | Rule engine, session timers, notification fan-out. Face embedding runs in a separate Python Face API, because Edge Functions run on Deno and can't run InsightFace |
| File storage | Supabase Storage (private buckets) | Enrollment images, evidence snapshots (auto-expire) |
| Edge service | Python 3.11, FastAPI, OpenCV, ONNX Runtime | Reads the camera streams, runs the models, exposes a local health/admin API |
| Face detection + recognition | InsightFace (RetinaFace/SCRFD detector + ArcFace `buffalo_s` / `buffalo_l` embeddings) | Accurate, runs on CPU, produces 512-d vectors |
| Person counting | Ultralytics YOLOv8n (class "person") + ByteTrack | Light enough for a laptop CPU; tracking stabilises counts |
| Liveness (anti-spoof) | MediaPipe Face Landmarker in the browser (blink / head-turn challenge) + optional server-side Silent-Face anti-spoofing model | Stops a student holding up a friend's photo |
| In-browser face capture | MediaPipe Tasks (Web) | Face framing and quality checks before upload |
| IoT messaging | MQTT 3.1.1/5 with Mosquitto (local) or HiveMQ Cloud | Matches the Cisco connectivity layer; edge publishes events, the ingest worker forwards them to Supabase |
| Location | Browser Geolocation API + geofence polygon per room (PostGIS or Turf.js) | Checks "inside the classroom" for self-verification |
| Hosting | Vercel (web), Supabase Cloud (backend), edge on the classroom laptop | Zero-ops for a student project |
| Monitoring | Edge heartbeat table, Sentry (web), Supabase logs | Shows when a camera or edge node goes offline |

## Roles and features

There are three human roles plus a machine role for the edge node. Each sees only its own data, enforced by Postgres Row-Level Security.

### Admin (controls everything)

- **Academic setup:** departments, semesters, courses, sections, classrooms (with a GPS geofence polygon and floor), weekly timetable slots, holidays and exam weeks.
- **People:** create or bulk-import students and professors (CSV), activate or deactivate accounts, reset passwords.
- **Assignments:** assign professors to sections (primary and TA), enroll students in sections (single or bulk), handle drop/add mid-semester with an effective date.
- **Face enrollment control:** send "verify your face" alerts to all newly enrolled students, track who has completed enrollment (pending / done / rejected), force re-enrollment, and review flagged enrollments manually.
- **Devices:** register edge nodes and cameras per room, see live heartbeat and FPS, rotate device API keys.
- **Policy settings:** late threshold, absent threshold, recheck timing, face-match threshold, geofence radius, minimum attendance %, whether "left early" counts as absent or partial.
- **Reports:** attendance by course, student, professor or date; low-attendance list; export to CSV/PDF; a full audit log of every manual change.
- **Privacy:** consent records, data-retention timer, delete a student's biometric data on request or when they graduate.

### Professor

- **Today's classes:** start a session (or let it auto-start from the timetable), end it, cancel it, or reschedule it as a make-up class.
- **Live dashboard:** roster with statuses updating in real time, gate count vs inside count, a mismatch banner, and the camera feed status.
- **Actions:** send a self-verify request to unmarked students, launch the end-of-class recheck, show the rotating QR on the projector, and manually mark a student with a reason that is logged.
- **Review:** approve or reject student appeals, view evidence snapshots for disputed cases, and lock the session when done.
- **Analytics:** per-student attendance %, lateness trends, and students at risk.

### Student

- **Onboarding:** accept the biometric consent, then complete face enrollment (guided capture: 5 angles with a liveness check).
- **Notifications:** enrollment reminder, "you were not detected, verify now", recheck request, marked late/absent, low-attendance warning.
- **Self-verification:** face + liveness + location (+ QR scan if enabled) inside a time window.
- **My attendance:** per-course percentage, a calendar view, and a history with the method used for each mark.
- **Appeals:** dispute a mark with a reason and an attachment (e.g. a medical note); track its status.
- **Account:** devices registered for push, request re-enrollment (new glasses, beard, etc.).

### Edge node (machine role)

- Authenticates with a per-device key and can only write `gate_events`, `occupancy_samples` and heartbeats for its own room.
- Pulls the embeddings of the students enrolled in the current session only, never the whole university.

### IoT operator (optional fourth human role)

- Registers edge nodes and cameras, sets each camera's ROI mask and entry line, and rotates device keys.
- Watches the device-health page: heartbeat, FPS, frame age, queue backlog and reconnect count.
- Can restart a pipeline or send `reload_gallery` from the dashboard.
- **Cannot** read or change attendance records. This keeps the person who maintains the cameras separate from the people who grade students.
- In the prototype, the admin holds this role too. Splitting it out later is a role assignment, not a code change.

## Face enrollment flow

Enrollment turns 5–10 good photos into a few 512-number embedding vectors per student. Only the vectors are needed for recognition; the photos can be deleted after approval.

1. **Admin enrolls the student in a section.** A database trigger sees that `face_profiles.status` is missing or `pending`, creates a notification, and sends the push "Verify your face to activate attendance".
2. **Student opens the link** in the PWA, signs in, and accepts the biometric consent screen (purpose, retention period, right to delete). The consent is stored with a timestamp and version.
3. **Guided capture in the browser** uses MediaPipe Face Landmarker to check, in real time, that there is exactly one face, it is big enough, sharp, well lit, and not covered by a mask or sunglasses.
4. **Liveness challenge:** the app asks for a random sequence such as "blink", "turn left" and "smile", and checks it from the landmarks. A printed photo or replayed video fails.
5. **Pose set:** the app auto-captures front, slight left, slight right, slight up and slight down, using 2 frames per pose.
6. **Upload** to the `enroll` endpoint of the Python Face API (FastAPI) over HTTPS; raw photos go to a private bucket.
7. **Server-side processing:** InsightFace detects the face, aligns it, and computes an ArcFace embedding per image. Blurry outliers are rejected. If fewer than 5 good images remain, the student is asked to retry.
8. **Duplicate check:** each new embedding is compared against all existing ones with pgvector. If it is very close to *another* student's profile, the enrollment is flagged for admin review. This catches one person enrolling for a friend.
9. **Store:** the embeddings go into `face_embeddings` (one row per image, plus a mean "template" vector). The status becomes `active`, or `review` if flagged.
10. **Cleanup:** raw photos are deleted after N days (configurable), or kept only as a single low-resolution thumbnail for admin review.

**Re-enrollment** is triggered by the student (appearance change), by the admin, or automatically when the student's match scores keep coming in just above the threshold. New embeddings are added; the old ones are kept for one semester so the change is gradual.

## Class session lifecycle

```text
Before class (T0-10: gallery loaded, cameras checked) -> On time (T0..T0+10: gate -> present)
-> Late window (T0+10..T0+30: gate -> late; mismatch check every 5 min; if C > V -> verify-now push)
-> Recheck (T_end-10: compare C vs V, push to present students, 3-5 min window; not re-verified -> left_early)
-> Finalize (T_end: pending -> absent; lock after 48 h)
```

The mismatch check keeps running every 5 minutes from T0 + 10 until the recheck window opens. Late-window rules apply only to *first* arrival; a student already marked is never downgraded by the time of day.

**Session states:** `scheduled` → `live` (auto-started by `pg_cron` from the timetable, or by the professor) → `recheck` → `ended` → `locked`. `cancelled` can be set from `scheduled` or `live`.

**What happens at each transition:**

1. **scheduled → live:** an attendance row is created for every enrolled student (`pending`), the policy thresholds are copied into `class_sessions.policy` (so later setting changes don't rewrite history), the edge node gets a `start` command and downloads the session gallery, and the QR secret is generated.
2. **live:** gate events and occupancy samples stream in, and the rule engine updates statuses and runs mismatch checks.
3. **live → recheck:** triggered at T\_end − 10 min if C < V (or manually). A `verification_request` of kind `recheck` opens.
4. **recheck → ended:** at T\_end, `finalize_session` runs. Remaining `pending` → `absent`, failed rechecks → `left_early`. The edge wipes the gallery and stops the pipelines. Students get their final status by push.
5. **ended → locked:** after 48 h, professor edits are closed; only the appeal workflow can change a mark.

## Edge AI pipelines

The edge node runs two independent pipelines, one per camera. Both send small JSON events, never video, so the system works on weak Wi-Fi and keeps faces off the cloud.

### Gate camera: who entered

1. **Grab frames** in a separate thread and always keep only the newest frame, so the pipeline never falls behind. Skip processing when there is no motion (frame difference) to save CPU.
2. **Detect faces** with SCRFD on a 640 px frame and drop faces smaller than about 80 px or blurrier than a Laplacian-variance cutoff.
3. **Track** each person across frames (ByteTrack on the face/body boxes) so one walk through the door = one `track_id`.
4. **Direction:** draw a virtual line across the doorway. Crossing it toward the room = `IN`; crossing toward the corridor = `OUT`. OUT events update the count even when no face is visible.
5. **Recognise:** for each IN track, take the 3–5 best crops and compute ArcFace embeddings. Compare them with cosine similarity against the **session gallery**, i.e. only the students enrolled in this section, loaded at session start.
6. **Decide by voting:** accept student X only if (a) at least 2 crops agree, (b) the best similarity is above the accept threshold (start around 0.45 for `buffalo_l` and tune it on your own data), and (c) it beats the second-best candidate by a clear margin. Otherwise the result is `unknown`.
7. **Deduplicate:** a student already marked in this session is ignored. A new IN after an OUT is logged as a *re-entry*.
8. **Publish** `gate_event` (MQTT + local queue): `{event_id, session_id, track_id, direction, student_id|null, score, margin, ts}`. Unknown faces include a short-lived, blurred snapshot reference for the professor to review.
9. **Feedback:** optionally publish to the ESP32/LED: green = marked, red = not recognised (please verify on your phone).

### Inside camera: how many are here

1. Every 2–3 s, run YOLOv8n ("person" class, confidence ≥ 0.4) inside a **region-of-interest mask** that covers only the seats. The door, projector screen and windows are masked out.
2. **Exclude staff:** mask the podium area, or subtract the number of staff configured for the session (professor + TAs).
3. **Smooth:** the reported count is the median of the last \~10 samples, which absorbs people hidden for a moment behind others.
4. A **stable count** = a smoothed value that has not changed for 60 s. Only stable counts trigger mismatch alerts, so a student briefly bending down does not fire one.
5. **Publish** `occupancy_sample` every 10 s: `{session_id, raw, smoothed, stable, ts}`.

### Reliability on the edge

- **Offline buffer:** every event goes into a local SQLite queue first and is sent with its original timestamp when the network returns. The server ignores duplicates by `event_id`.
- **Heartbeat** every 15 s with CPU, FPS per camera and last-frame age. The dashboard shows "gate camera offline" within 30 s.
- **Gallery hygiene:** session embeddings are held only in RAM and wiped when the session ends.
- **Auto-recovery:** if a stream drops (phone sleeps or the IP changes), the service reconnects with backoff and raises an alert after 3 failures.

## Mismatch handling, self-verification and early-leave recheck

Two numbers drive everything here. **V** = students verified present (gate + self-verify). **C** = the stable inside count, excluding staff.

### Mismatch check (runs at T0 + 10 min, then every 5 min)

| Situation | Meaning | Automatic action |
| --- | --- | --- |
| C > V | Some people in the room were not recognised at the gate (camera missed them, they wore a mask, they came in with a group) | Push "We couldn't confirm you, verify now" to **every enrolled student still `pending`**. The window is 5 min. Only students physically in the room can pass. |
| C < V | Someone who was marked has left, or the camera is temporarily blocked | Log it. If it lasts more than 5 min, notify the professor ("3 fewer people than verified"). |
| C > enrolled | Visitors, auditors or the wrong room | Inform the professor only. Nobody is marked. |
| C = V | Everything agrees | Nothing to do |

Pushing to all pending students, not a chosen few, is deliberate. The inside camera only counts people; it cannot say *who* is unmarked. The location and face check sorts out who is actually in the room.

### Student self-verification (one screen, about 20 seconds)

1. **Open the push** and the PWA opens on the verification screen with a countdown.
2. **Location:** the app gets a high-accuracy GPS fix. It passes if the point, expanded by the reported accuracy, overlaps the room's geofence polygon and the accuracy is within the allowed value (e.g. ≤ 40 m).
3. **Room code (recommended):** the student scans the QR shown on the projector. It is an HMAC token that changes every 20 s and is tied to the session. This proves physical presence much better than GPS (see the note below).
4. **Face + liveness:** a random challenge (blink, turn) runs in the browser. One frame is uploaded and matched server-side against *that student's own* embeddings (1:1 verification, stricter threshold than the gate).
5. **Result:** the attendance row is updated with `method = self_verify` and the evidence (scores, GPS accuracy, QR token id) is stored in `verification_attempts`. The professor dashboard updates live.
6. **Failure:** the student gets up to 3 attempts. After that, a "request manual check" button sends the case to the professor's queue.

**Important limit:** indoor GPS is usually only accurate to 10–50 m and cannot tell floors apart, so a student in the next room or the corridor can pass a GPS-only check. Phones can also fake their location. Treat GPS as a supporting signal and use the rotating room QR (or the professor's manual confirmation) as the real proof of presence.

### Early-leave recheck (T\_end − 10 min, configurable 5–10)

1. **Compare** the stable count C with the number currently marked present/late. If C < V by more than the tolerance (default 1, for occlusion), alert the professor: "Verified 42, counted 38 — run recheck?"
2. **Professor taps Recheck** (or sets it to run automatically). Every student currently `present` or `late` gets a push with a 3–5 min window.
3. Students in the room complete the same self-verify flow (face + location + QR).
4. **When the window closes**, anyone who did not verify becomes `left_early`. University policy decides whether that counts as **absent** (your original rule) or as partial attendance. It is an admin setting.
5. **Exit events** from the gate (OUT crossings, plus any recognised exit faces) are shown next to each name, so the professor can see *who* probably left before confirming.
6. The professor can still override any result, with a reason that goes into the audit log.

## Attendance status rules

The status is decided by the **earliest trusted evidence time** for the student. A student the camera missed at 9:02 who self-verifies at 9:12 during the first mismatch window is still `present`. All thresholds are admin settings; the defaults are shown.

| Status | Rule (T0 = class start) | Typical evidence |
| --- | --- | --- |
| `pending` | Session running, no evidence yet | — |
| `present` | Evidence at or before T0 + 10 min, **or** verified in the first mismatch window | Gate match, or self-verify after a camera miss |
| `late` | First evidence between T0 + 10 and T0 + 30 min | Gate match or self-verify |
| `absent` | No evidence by session end, **or** first evidence after T0 + 30 min (shown as "very late") | — |
| `left_early` | Was present/late, then failed the end-of-class recheck | Recheck result + OUT events |
| `excused` | Approved appeal or admin-entered leave (medical, official event) | Document attachment |

**Lifecycle of a mark:** auto-decided → professor can edit until the session is **locked** (default 48 h after class) → the student can appeal within 7 days → the professor or admin decides → final. Every change stores who, when, old value, new value and reason.

**Course-level rules:** attendance % = (present + late × late\_weight + excused) ÷ held sessions. Late\_weight defaults to 1, and "3 lates = 1 absence" is optional. The system warns the student (and optionally their advisor) at 85% and 75%.

## Evidence model and event contract

Sensors only ever report what they **observed**. The rule engine alone **decides** attendance, and every decision links back to the observations it used. This makes any mark explainable ("why am I absent?") and lets you re-run decisions when the policy or a threshold changes.

**Four claims the system never mixes up:**

| Claim | Source | Can it mark someone present on its own? |
| --- | --- | --- |
| A person was detected | YOLO at the gate or inside | No; it is just a body |
| An identity was recognised | ArcFace match at the gate | Yes, if score and margin pass and liveness is not in doubt |
| A student proved presence | Self-verify: face 1:1 + liveness + room QR (+ GPS) | Yes |
| A number of people is in the room | Inside camera count | Never; it only *triggers* verification |

**Extra table linking decisions to evidence** (add to the schema):

```sql
create table attendance_evidence (
  session_id uuid, student_id uuid,
  source text check (source in ('gate_event','verification_attempt','manual','appeal')),
  source_id text,            -- gate_events.event_id or verification_attempts.id
  weight text check (weight in ('strong','supporting','context')),
  rule_version text,         -- which policy version used it
  created_at timestamptz default now(),
  foreign key (session_id, student_id) references attendance
);
```

**Event envelope** (every MQTT message and edge API call uses this shape):

```json
{
  "event_id": "0f6c…uuid",
  "event_type": "GATE_ENTRY_RECOGNISED",
  "source_device_id": "edge-room-B204",
  "session_id": "…uuid",
  "observed_at": "2026-11-18T00:59:58.412Z",
  "received_at": null,
  "model_version": "buffalo_l@2024 / thr-0.45",
  "payload": { "track_id": 17, "student_id": "…uuid", "score": 0.61, "margin": 0.19 },
  "simulation": false
}
```

The server fills in `received_at`, ignores any `event_id` it has already seen, and keeps both timestamps, so delayed offline events are visible as delayed.

**Event types:**

- **Edge:** `GATE_PERSON_IN`, `GATE_PERSON_OUT`, `GATE_ENTRY_RECOGNISED`, `GATE_ENTRY_UNKNOWN`, `OCCUPANCY_UPDATED`, `CAMERA_OFFLINE`, `CAMERA_ONLINE`, `EDGE_HEARTBEAT`
- **App:** `FACE_ENROLLED`, `VERIFY_REQUESTED`, `VERIFY_PASSED`, `VERIFY_FAILED`, `QR_SCANNED`
- **Engine:** `SESSION_STARTED`, `MISMATCH_DETECTED`, `RECHECK_OPENED`, `STATUS_CHANGED`, `SESSION_FINALIZED`
- **People:** `MANUAL_OVERRIDE`, `APPEAL_SUBMITTED`, `APPEAL_DECIDED`

**Fail-safe rule:** missing data is never treated as absence. If a camera goes offline, the edge node goes down, or a push isn't delivered, the student is routed to self-verify or professor review instead of being marked absent automatically. The only automatic negative outcomes are (a) no evidence at all by session end, while the session's devices were healthy, and (b) not answering a recheck the student actually received.

## Edge-case scenarios

These are the situations that break naive attendance systems, and how this one handles each.

| Scenario | How it's detected | What the system does |
| --- | --- | --- |
| Camera misses a student (mask, group entry, bad angle) | C > V at mismatch check | Self-verify push; marked `present` if verified in the first window |
| Student arrives late | First gate match after T0 + 10 | Marked `late` automatically; professor sees it live |
| Student arrives very late (after T0 + 30) | Gate match after the absent threshold | Marked `absent`, flagged "very late"; professor can upgrade it |
| Student leaves early and doesn't return | C < V at recheck + OUT event | Recheck → not verified → `left_early` (absent by policy) |
| Student steps out (restroom) and returns | OUT then IN with the same identity | Logged as a re-entry; status unchanged; visible to the professor |
| Proxy: friend holds up a photo or video on the self-verify screen | Liveness challenge fails | Attempt rejected and logged; repeated attempts flag the account |
| Proxy: friend verifies from outside the room | No valid room QR / GPS outside geofence | Rejected; the professor's queue shows the failed attempt |
| Someone enrolls their friend's face | Duplicate-embedding check at enrollment | Enrollment goes to admin review |
| Lookalikes / twins | Small margin between the top-2 gallery matches | Gate returns `unknown` → both get the self-verify path |
| Student hasn't enrolled their face | `face_profiles.status ≠ active` | Cannot be gate-matched; gets self-verify (location + QR + professor confirm) and an enrollment reminder |
| Appearance change (glasses, beard, makeup) | Scores drifting toward the threshold | Auto-prompt to re-enroll; new embeddings added |
| Student's phone is dead / has no camera | Student taps "I can't verify" from a friend's device, or tells the professor | Professor marks manually with a reason (audited) |
| GPS is weak indoors | Accuracy worse than the allowed value | Falls back to room QR + face; never fails on GPS alone |
| Wi-Fi or internet drops during class | Edge heartbeat stops reaching the cloud | Edge keeps working and queues events; uploads on reconnect with original timestamps |
| Gate camera dies mid-class | Heartbeat shows frame age > 30 s | Professor alert; switch to "self-verify for everyone" mode with one tap |
| Edge laptop not running at all | No heartbeat at session start | Session runs in fully manual + QR self-verify mode |
| Professor absent / substitute | Admin assigns a substitute for that session | Substitute gets dashboard access for that session only |
| Class cancelled | Professor/admin cancels | No attendance; doesn't count toward percentages; students notified |
| Room change / make-up class | New session with a different room/time | Uses that room's devices and geofence |
| Student enrolled in two overlapping sections | Timetable conflict check on enrollment | Admin blocked from saving; or the student is matched only to the section whose room they enter |
| Student dropped the course mid-semester | Enrollment `end_date` passed | Removed from the session gallery; past records kept |
| Visitor / non-enrolled student enters | Gate face not in the session gallery | Counted as `unknown`; the professor sees "1 unknown person" |
| Professor or TA walking around | Podium mask / staff count | Excluded from C |
| Occlusion makes the count wobble | Raw count varies | Median smoothing + 60 s stability rule before any alert |
| Same student tries to verify on two phones | Device id + session id uniqueness | Second device blocked; flagged |
| Clock differences between devices | All timestamps from the server or the NTP-synced edge | Phone clock never used for status timing |

## Database schema

This is the core Postgres schema for Supabase (`extensions: vector, postgis, pg_cron`). Every table has RLS on. Students read only their own rows, professors only their own sections, edge devices only their own room's sessions.

```sql
-- People & roles
create type user_role as enum ('admin','professor','student','device');
create table profiles (
  id uuid primary key references auth.users,
  role user_role not null,
  full_name text not null,
  student_no text unique,            -- null for staff
  department_id uuid references departments,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- Academic structure
create table departments (id uuid primary key default gen_random_uuid(), name text not null);
create table semesters   (id uuid primary key default gen_random_uuid(), name text, starts_on date, ends_on date);
create table courses     (id uuid primary key default gen_random_uuid(), code text unique, title text, department_id uuid references departments, credits int);
create table rooms (
  id uuid primary key default gen_random_uuid(),
  name text, building text, floor int,
  geofence geography(polygon, 4326),   -- classroom outline
  max_gps_accuracy_m int default 40
);
create table sections (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references courses, semester_id uuid references semesters,
  section_no text, room_id uuid references rooms
);
create table section_staff (section_id uuid references sections, profile_id uuid references profiles,
  staff_role text check (staff_role in ('primary','ta','substitute')), primary key (section_id, profile_id));
create table enrollments (
  section_id uuid references sections, student_id uuid references profiles,
  starts_on date default current_date, ends_on date,   -- drop/add
  primary key (section_id, student_id)
);
create table timetable_slots (id uuid primary key default gen_random_uuid(), section_id uuid references sections,
  weekday int, start_time time, end_time time, room_id uuid references rooms);

-- Biometrics
create table biometric_consents (student_id uuid references profiles, version text, accepted_at timestamptz,
  withdrawn_at timestamptz, primary key (student_id, version));
create table face_profiles (
  student_id uuid primary key references profiles,
  status text check (status in ('pending','active','review','rejected','deleted')) default 'pending',
  template vector(512),               -- mean embedding
  enrolled_at timestamptz, model_version text
);
create table face_embeddings (
  id bigserial primary key, student_id uuid references profiles,
  embedding vector(512) not null, quality real, pose text, created_at timestamptz default now()
);
create index on face_embeddings using hnsw (embedding vector_cosine_ops);

-- Devices (IoT)
create table edge_devices (id uuid primary key default gen_random_uuid(), room_id uuid references rooms,
  name text, api_key_hash text, last_seen timestamptz, status jsonb);
create table cameras (id uuid primary key default gen_random_uuid(), device_id uuid references edge_devices,
  kind text check (kind in ('gate','inside')), stream_url text, roi jsonb, entry_line jsonb);

-- Sessions & attendance
create type session_state as enum ('scheduled','live','recheck','ended','locked','cancelled');
create table class_sessions (
  id uuid primary key default gen_random_uuid(), section_id uuid references sections, room_id uuid references rooms,
  starts_at timestamptz, ends_at timestamptz, state session_state default 'scheduled',
  staff_count int default 1, qr_secret text, policy jsonb    -- snapshot of thresholds
);
create type att_status as enum ('pending','present','late','absent','left_early','excused');
create table attendance (
  session_id uuid references class_sessions, student_id uuid references profiles,
  status att_status default 'pending',
  method text check (method in ('gate','self_verify','recheck','manual','appeal')),
  first_seen_at timestamptz, last_verified_at timestamptz,
  updated_by uuid references profiles, note text,
  primary key (session_id, student_id)
);
create table gate_events (event_id uuid primary key, session_id uuid references class_sessions,
  track_id int, direction text, student_id uuid, score real, margin real, snapshot_path text, ts timestamptz);
create table occupancy_samples (id bigserial primary key, session_id uuid references class_sessions,
  raw int, smoothed int, stable boolean, ts timestamptz);
create table verification_requests (id uuid primary key default gen_random_uuid(), session_id uuid references class_sessions,
  kind text check (kind in ('mismatch','recheck','manual')), opens_at timestamptz, closes_at timestamptz,
  created_by uuid, target_count int);
create table verification_attempts (id uuid primary key default gen_random_uuid(), request_id uuid references verification_requests,
  student_id uuid references profiles, device_id text, face_score real, liveness_ok boolean,
  lat double precision, lng double precision, gps_accuracy_m real, qr_ok boolean,
  result text check (result in ('pass','fail')), reason text, created_at timestamptz default now());

-- Workflow & audit
create table appeals (id uuid primary key default gen_random_uuid(), session_id uuid, student_id uuid,
  reason text, attachment_path text, status text default 'open', decided_by uuid, decided_at timestamptz);
create table notifications (id uuid primary key default gen_random_uuid(), user_id uuid references profiles,
  type text, title text, body text, data jsonb, read_at timestamptz, created_at timestamptz default now());
create table push_subscriptions (id uuid primary key default gen_random_uuid(), user_id uuid references profiles,
  endpoint text unique, keys jsonb, user_agent text, created_at timestamptz default now());
create table audit_log (id bigserial primary key, actor uuid, action text, entity text, entity_id text,
  before jsonb, after jsonb, reason text, at timestamptz default now());
create table settings (key text primary key, value jsonb);  -- late/absent/recheck thresholds etc.
```

**Key views and RPCs:**

- `v_session_live(session_id)`: roster + status + V + latest C + mismatch flag. This is what the professor dashboard subscribes to.
- `match_face(student_id, embedding)` → cosine score (1:1, for self-verify).
- `apply_gate_event(event)` → idempotent insert + attendance status update in one transaction.
- `finalize_session(session_id)` → pending → absent, run recheck results, write the audit log.
- `attendance_summary(student_id, section_id)` → percentages for the portals and warnings.

## APIs, MQTT topics and realtime events

There are three channels: **HTTPS** for request/response, **MQTT** for device events (the IoT connectivity layer), and **Supabase Realtime** for pushing changes to open dashboards.

### HTTPS endpoints (Next.js route handlers + Supabase Edge Functions)

| Method & path | Caller | Purpose |
| --- | --- | --- |
| `POST /api/admin/import/{students,professors}` | Admin | CSV bulk import |
| `POST /api/admin/enrollments` | Admin | Enroll students in a section (triggers the face-enrollment push) |
| `POST /api/admin/face/{studentId}/reenroll` | Admin | Force re-enrollment |
| `POST /face/enroll` | Student | Upload capture set → embeddings, duplicate check, status |
| `POST /api/sessions/{id}/start` · `/end` · `/cancel` | Professor or `pg_cron` | Session lifecycle |
| `POST /api/sessions/{id}/verify-requests` | Professor / rule engine | Open a mismatch or recheck window, fan out the push |
| `GET /api/sessions/{id}/qr` | Professor dashboard | Current rotating QR token (20 s) |
| `POST /face/verify` | Student | Face frame + liveness result + GPS + QR → pass/fail |
| `PATCH /api/attendance/{sessionId}/{studentId}` | Professor | Manual change with reason (audited) |
| `POST /api/appeals` · `PATCH /api/appeals/{id}` | Student · Professor | Appeal workflow |
| `POST /api/push/subscribe` | Any user | Save a Web Push subscription |
| `GET /edge/v1/sessions/current?room=` | Edge (device key) | Active session + its policy |
| `GET /edge/v1/sessions/{id}/gallery` | Edge (device key) | Embeddings of enrolled students only |
| `POST /edge/v1/heartbeat` | Edge | Health + FPS per camera |

### MQTT topics (broker: Mosquitto on the LAN, bridged to the cloud ingest worker)

| Topic | Publisher → subscriber | Payload |
| --- | --- | --- |
| `campus/{room}/gate/event` | Edge → ingest | `{event_id, session_id, track_id, direction, student_id, score, margin, ts}` |
| `campus/{room}/inside/occupancy` | Edge → ingest | `{session_id, raw, smoothed, stable, ts}` |
| `campus/{room}/device/heartbeat` | Edge → ingest | `{device_id, cpu, fps:{gate,inside}, frame_age_ms, ts}` |
| `campus/{room}/gate/feedback` | Edge → ESP32 | \`{result:"ok" |
| `campus/{room}/control` | Cloud → Edge | \`{cmd:"start" |

Use QoS 1 for events (at-least-once; the server dedups by `event_id`), TLS on port 8883, and a username and password per device.

### Realtime channels (Supabase)

- `session:{id}` — Postgres changes on `attendance`, plus broadcast `count_update` and `mismatch` events. The professor dashboard subscribes here.
- `user:{id}` — the in-app notification inbox (a mirror of push, so nothing is lost if push fails).
- `admin:devices` — heartbeat changes for the device-health page.

### Push notification types

`enroll_face` · `verify_now` (mismatch) · `recheck_now` · `marked_late` · `marked_absent` · `left_early` · `appeal_update` · `low_attendance` · `class_cancelled` · `device_offline` (staff). Each carries a deep link, such as `/verify/{requestId}`, and an expiry time so a stale push opens a "window closed" screen.

## Security, privacy and anti-spoofing

Face data is the most sensitive thing this system holds, so it is collected with explicit consent, stored as vectors only, and never leaves the edge as video.

**Privacy**

- In Korea, biometric data is treated as sensitive information under PIPA and needs separate, explicit consent. Confirm the exact wording with your university before running it with real students.
- Collect the minimum: embeddings, not photos, after approval. No continuous video recording; only short-lived, blurred snapshots of *unknown* entrants (auto-deleted after 24 h).
- Students can withdraw consent. Their embeddings are deleted and they move to the non-biometric path (QR + professor confirmation).
- Retention: embeddings are deleted at graduation or withdrawal; attendance records follow university record rules.

**Access control**

- RLS on every table. A professor can only see sections in `section_staff`, a student only their own rows, and an edge device only its room's active session.
- Edge devices use per-device API keys (stored hashed, rotatable). The gallery endpoint returns only the current section's embeddings.
- The service-role key exists only in Edge Functions, never in the browser or on the edge laptop.
- Every manual change, override and appeal decision goes into `audit_log`.

**Anti-spoofing / anti-proxy**

- Liveness: a random challenge (blink, turn, smile) in the browser, plus an optional server-side passive anti-spoof model on the uploaded frame.
- 1:1 face match on self-verify uses a stricter threshold than the gate's 1:N search.
- A rotating room QR (HMAC of `session_id` + 20-second time slot) proves physical presence. A screenshot sent to a friend outside expires almost immediately.
- Device binding: one verifying device per student per session. A new device needs a re-login and is flagged.
- Rate limits on `/face/verify` (3 attempts per request window).
- The duplicate-face check at enrollment stops one person enrolling under two accounts.

**Transport and infrastructure**

- HTTPS everywhere (the PWA, camera APIs and push all require it). MQTT over TLS with per-device credentials.
- Camera streams stay on the local network. Put the IP Webcam app behind a password and do not port-forward it.
- Private Storage buckets with signed URLs that expire in minutes.

**Hardening checklist**

- MFA (TOTP) for admin and IoT-operator accounts. Supabase Auth supports it.
- Realtime channels are private and authorized with RLS. A random channel name is not access control.
- Store every timestamp in UTC (`timestamptz`) and show it in Asia/Seoul time in the UI.
- Unique constraints: one attendance row per (session, student), one `event_id` per event.
- Encrypted, scheduled database backups. Secrets live in `.env` / Vercel env vars, never in git, with a `.env.example` in the repo.
- When the gate cannot tell which face belongs to which body (people entering shoulder to shoulder), it records `GATE_ENTRY_UNKNOWN` rather than guessing an identity.

**Fairness and accuracy**

- Measure the false accept and false reject rates on your own test set, across lighting conditions and different student groups. Pick thresholds from that data, not from defaults.
- A failed recognition must never become an absence on its own. Every automated negative path ends in self-verify or professor review.

## Project structure, deployment, milestones and testing

Build it as a monorepo with three apps, shipped in six phases. Each phase ends with something you can demo.

### Repository layout

```text
smart-attendance/
├─ apps/
│  ├─ web/                      # Next.js PWA (admin, professor, student portals)
│  │  ├─ app/(admin)/ ...        # courses, people, enrollments, devices, reports, settings
│  │  ├─ app/(professor)/ ...    # today, live/[sessionId], review, analytics
│  │  ├─ app/(student)/ ...      # enroll-face, verify/[requestId], attendance, appeals
│  │  ├─ lib/face/               # MediaPipe capture + liveness challenge
│  │  ├─ lib/geo/                # geofence check (Turf.js)
│  │  └─ public/sw.js            # service worker: push + offline shell
│  ├─ edge/                     # Python edge node
│  │  ├─ main.py                 # FastAPI + supervisor
│  │  ├─ cameras/stream.py       # RTSP/MJPEG/USB reader, reconnect
│  │  ├─ pipelines/gate.py       # detect → track → line-cross → recognise → vote
│  │  ├─ pipelines/occupancy.py  # YOLO + ROI mask + smoothing
│  │  ├─ gallery.py              # load/wipe session embeddings
│  │  ├─ mqtt_client.py          # publish events, receive control
│  │  ├─ queue.db                # SQLite offline buffer
│  │  └─ config.yaml             # room id, stream URLs, ROI, entry line, thresholds
│  └─ ingest/                   # MQTT → Supabase bridge (small Node or Python worker)
├─ supabase/
│  ├─ migrations/               # schema above, RLS policies, views, RPCs
│  ├─ functions/enroll/ self-verify/ notify/ session-tick/
│  └─ seed.sql                  # demo university, 2 courses, 30 students
└─ docs/ (architecture, API, setup guide)
```

### Deployment

- **Web:** Vercel (HTTPS out of the box, which push and the camera APIs require).
- **Backend:** Supabase Cloud project with the `vector` and `postgis` extensions, and `pg_cron` jobs every minute for session start/end, mismatch checks and recheck timing.
- **Edge:** classroom laptop running `python -m edge` as a startup service. The IP Webcam phone gets a fixed IP (DHCP reservation).
- **Broker:** Mosquitto on the edge laptop for the demo, or HiveMQ Cloud free tier if the ingest worker runs in the cloud.
- **Secrets:** `.env` per app. The device key is stored in the edge's `config.yaml`, which is never committed.

### Milestones

1. **Phase 1 — Foundation (wk 1–2):** Supabase schema + RLS, auth with roles, admin CRUD for courses/sections/rooms/people, CSV import, enrollment. *Demo: admin sets up a semester.*
2. **Phase 2 — Face enrollment (wk 3–4):** PWA install, push subscription, consent screen, guided capture with liveness, `enroll` function, pgvector storage, duplicate check. *Demo: a student enrolls from their phone.*
3. **Phase 3 — Gate pipeline (wk 5–6):** edge service, phone stream, detect/track/recognise/vote, entry line, MQTT → ingest → `attendance`. Professor live dashboard with Realtime. *Demo: walk through the door, your name turns green.*
4. **Phase 4 — Occupancy + mismatch (wk 7):** inside camera counting, smoothing, mismatch rule, `verify_now` push, self-verify (face + GPS + QR). *Demo: hide from the gate camera, get a push, verify.*
5. **Phase 5 — Recheck + rules (wk 8):** end-of-class recheck, late/absent/left-early logic, finalize job, manual override, appeals, reports. *Demo: leave early, get marked.*
6. **Phase 6 — Hardening (wk 9–10):** offline queue, heartbeats and device page, anti-spoof model, threshold tuning, audit log, privacy deletion, load test, final report. *Demo: unplug the Wi-Fi mid-class and nothing is lost.*

### Testing

| What | How | Pass criterion (set your own target) |
| --- | --- | --- |
| Recognition accuracy | 20–30 volunteers × several entries under different lighting; log true/false accepts | Record the false accept and false reject rates and pick the threshold from them |
| Counting accuracy | Compare the smoothed count with a manual headcount every 5 min in a real class | Error within ±1–2 people when stable |
| Spoofing | Printed photo, phone-screen photo, replayed video against self-verify | All rejected |
| Location | Verify from the room, the corridor, the floor above, and a mocked GPS | Shows why the QR factor is needed |
| Rule engine | Unit tests on status decisions with fixed timestamps (on time, late, very late, left early, re-entry) | Every case in the edge-case table produces the expected status |
| Offline | Cut the network for 10 min mid-session | No lost events, correct timestamps after replay |
| Load | Simulate 40 students self-verifying in the same 60 s | Every request answered within a few seconds |
| End-to-end demo | Full class script: on time, late, missed by the camera, leaves early, visitor | Dashboard and student portals match the script |

### Simulation mode (for testing with a few real people)

You won't have 40 students for every test, so the system includes a clearly labelled simulator:

- **Synthetic roster:** `seed.sql` creates 30 fake students in the demo section. A small CLI publishes MQTT events for them (`GATE_ENTRY_RECOGNISED`, late arrivals, OUT events) on a script, with `simulation: true`.
- **Recorded video:** the edge service can read an `.mp4` instead of a live stream. Record your friends walking through the door once, then replay it to tune thresholds repeatably.
- **Real + fake together:** you and 2–3 friends are real (real face, real phone, real push); everyone else is simulated. The dashboard shows a "SIM" badge on simulated rows, and they are excluded from reports.

### Model metrics to report

Measure these on your own recorded set. Don't quote numbers from papers.

| Metric | What it tells you |
| --- | --- |
| Gate FAR (false accept rate) | How often a wrong student is marked. Keep this near zero; it is the dangerous error |
| Gate FRR (false reject rate) | How often a real student is missed. This is cheap, because self-verify catches it |
| Unknown rate | Share of entries that fall back to self-verify |
| Occupancy MAE | Average absolute error of the stable count vs a manual headcount |
| Tracker ID switches | How often one person becomes two tracks. This causes double IN events |
| Liveness pass/fail on attacks | Printed photo, phone screen, video replay |
| End-to-end latency | From walking through the door to the name turning green on the dashboard |
| Edge FPS + CPU | Whether the laptop keeps up with both cameras |

### Live demo script (about 8 minutes)

1. Admin creates a course and section, enrolls 3 real + 30 simulated students, and assigns a professor.
2. A real student gets the enrollment push and enrolls their face on their phone (liveness challenge shown).
3. The professor's dashboard opens; the session auto-starts. The simulator brings in the fake students.
4. Real student A walks past the gate camera: the LED goes green and the name turns green on the dashboard.
5. Real student B hides their face while entering: the inside count is higher than verified, a push arrives, and B verifies with face + QR on the projector → `present`.
6. Real student C enters 12 minutes "late" (the clock is fast-forwarded in demo mode) → `late`.
7. Someone holds up a printed photo of A on the self-verify screen → rejected by liveness.
8. A walks out. At T\_end − 10 the count drops, the professor gets an alert and runs the recheck, and A doesn't verify → `left_early`.
9. Unplug the Wi-Fi for 1 minute, plug it back in: the queued events arrive with their original times.
10. The professor finalizes, the student sees the record, files an appeal, and the audit log shows every step.

## Limits, non-goals and key design decisions

State the limits plainly in your report and demo. Examiners trust a system more when it says what it can't do.

**What it cannot do**

- The inside count says *how many*, never *who*. Individual identity inside the room comes only from the gate or self-verify.
- A face match is probabilistic. Thresholds trade missed students against wrong students, and are tuned on your own data.
- GPS can't tell rooms or floors apart and can be faked. The room QR and the professor are the real presence checks.
- Liveness stops casual spoofing (photos, screens), not a determined attacker with a 3D mask.
- A webcam prototype covers one room. More rooms need one edge node per room or RTSP cameras feeding a stronger server.

**Non-goals:** no tracking of students outside class sessions, no emotion or engagement analysis, no continuous video recording, no automatic penalties without a route to appeal.

**Key design decisions**

| Decision | Why | Alternative rejected |
| --- | --- | --- |
| Edge recognition on the classroom laptop | Video stays in the room; works on weak Wi-Fi; matches Cisco L3 | Streaming video to the cloud (bandwidth, privacy) |
| Gallery = enrolled students of this section only | Matching 40 faces instead of 20,000 is faster and much more accurate | University-wide 1:N search |
| PWA instead of a native app | One Next.js codebase gives camera, GPS and push on Android + iOS | Native Kotlin app (only needed for background BLE) |
| Face + room QR for self-verify, GPS as support | GPS alone is too weak indoors | BLE beacons (need native apps and extra hardware) |
| MQTT between edge and cloud | Real IoT pattern, QoS, lightweight; scores well on the Cisco connectivity layer | Plain HTTP polling |
| Supabase (Postgres + pgvector + Realtime + Functions) | One managed backend for data, vectors, auth and live updates; you already know it | Custom FastAPI + Redis + separate vector DB |
| Observations separate from decisions | Explainable marks; policy can be re-run | Edge writes final status directly |
| Missing data ≠ absence | A broken camera must never punish students | Absent unless proven present |
| Policy snapshot per session | Changing a threshold later doesn't rewrite history | Global settings read live |

**Future upgrades:** RTSP/IP cameras and a GPU server for many rooms, BLE beacons with a native app as an extra presence signal, LMS integration (grades export), multi-campus tenancy, and an on-device face match so even the self-verify frame never leaves the phone.

## How to build it: step-by-step guide

Build it in 8 steps over about 10 weeks solo, or 5–6 weeks with three people. Every step ends with a test you can show. Don't start the AI parts until steps 1–3 work, because the web, database and push plumbing is what everything else plugs into.

**If you are a team of three:** Person A does web + Supabase (steps 1–3, the dashboards in 6–7). Person B does the Face API and the edge AI (steps 4–6). Person C does IoT and integration: MQTT, the ingest worker, the ESP32, devices, testing and the report. A and B agree the event envelope (the evidence model section) on day 1 so they can work in parallel.

### Step 0 — Tools and accounts (day 1)

- Install Node.js 20 LTS, Python 3.11, Git, VS Code, Mosquitto, and Microsoft C++ Build Tools (InsightFace needs them to install on Windows).
- Create free accounts: GitHub, Supabase, Vercel, Cloudflare (for the HTTPS tunnel).
- Phones: install **IP Webcam** on Android (on iPhone use **DroidCam**). Start the server and open `http://<phone-ip>:8080` in the laptop's browser. If you see video, the camera link works.
- Network: campus Wi-Fi often blocks device-to-device traffic. Use your own router or the laptop's hotspot so the phones, laptop and ESP32 can see each other.

### Step 1 — Repo + database (week 1)

```bash
mkdir smart-attendance && cd smart-attendance && git init
npx create-next-app@latest apps/web --ts --tailwind --app --eslint
cd apps/web && npx shadcn@latest init && cd ../..
npx supabase init
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase migration new init_schema   # paste the schema SQL from this doc
npx supabase db push
npx supabase gen types typescript --linked > apps/web/lib/database.types.ts
```

Start the migration with `create extension if not exists vector; create extension if not exists postgis;`. Then turn on RLS for every table and write a policy for each role. For example:

```sql
alter table attendance enable row level security;
create policy "student reads own" on attendance for select
  using (student_id = auth.uid());
create policy "staff reads own sections" on attendance for select
  using (exists (select 1 from class_sessions s
                 join section_staff st on st.section_id = s.section_id
                 where s.id = attendance.session_id and st.profile_id = auth.uid()));
```

**Test:** `seed.sql` loads a demo department, 2 courses, 3 real + 30 fake students, and the policies block a student from reading someone else's row.

### Step 2 — Auth, roles and admin portal (week 2)

- Use `@supabase/ssr` for login. `middleware.ts` reads `profiles.role` and redirects users to `/admin`, `/professor` or `/student`.
- Admin pages built with server actions: departments, semesters, courses, sections, rooms (draw the geofence on a Leaflet map), timetable slots, people, and enrollments. Use CSV import with `papaparse`.
- Write every admin change to `audit_log` with a database trigger, so you can't forget it in the app code.

**Test:** the admin creates a course and enrolls you; the enrollment appears in your student view.

### Step 3 — PWA + push notifications (week 3)

- Add `app/manifest.ts` and `public/sw.js`. The service worker handles the `push` event (show the notification) and `notificationclick` (open the deep link).
- Run `npx web-push generate-vapid-keys` and put the keys in env vars.
- In the browser: `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`, then POST the subscription to `/api/push/subscribe`.
- Sending: a Next.js route handler using the `web-push` npm package. A database webhook on `notifications` insert calls it, so any SQL code can send a push just by inserting a row.
- **Deploy to Vercel now.** Phones need HTTPS for push, camera and GPS. On iPhone, "Add to Home Screen" first, or push won't work.

**Test:** the admin enrolls you, and your phone shows "Verify your face" within seconds.

### Step 4 — Face API + face enrollment (week 4)

```bash
cd apps/face-api
python -m venv .venv && .venv\Scripts\activate
pip install fastapi uvicorn insightface onnxruntime opencv-python numpy supabase python-multipart
uvicorn main:app --port 8000
cloudflared tunnel --url http://localhost:8000   # gives you a public https URL
```

The core of the Face API:

```python
from insightface.app import FaceAnalysis
fa = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
fa.prepare(ctx_id=0, det_size=(640, 640))

def embed(bgr_image):
    faces = fa.get(bgr_image)
    if len(faces) != 1:
        return None                      # need exactly one face
    return faces[0].normed_embedding     # 512 floats, unit length
# cosine similarity = dot product of two normed embeddings
```

- `/face/enroll`: check the consent row, embed each image, reject blurry ones, run the duplicate check against pgvector, then insert into `face_embeddings` and set `face_profiles.status`.
- `/face/verify`: embed one frame and compare it only with that student's own embeddings (1:1).
- In the browser, use **MediaPipe Face Landmarker** (`@mediapipe/tasks-vision`). Its blendshapes give blink scores (`eyeBlinkLeft/Right`) and its transformation matrix gives head yaw, which is enough for the "blink, turn left" liveness challenge.
- InsightFace's pretrained models are licensed for non-commercial research. That is fine for a course project, but mention it in your report.

**Test:** enroll yourself and 2 friends. Your selfie scores high against your own profile and clearly lower against theirs. Write both numbers down; that is the start of threshold tuning.

### Step 5 — Edge node: gate pipeline + MQTT (weeks 5–6)

```bash
cd apps/edge
pip install opencv-python insightface onnxruntime ultralytics paho-mqtt pyyaml requests
```

The gate loop in short:

```python
cap = cv2.VideoCapture("http://192.168.0.21:8080/video")   # phone #1 (IP Webcam)
gallery = load_gallery(session_id)          # {student_id: [embeddings]} from /edge/v1/sessions/{id}/gallery
while running:
    ok, frame = cap.read()
    faces = fa.get(frame)                   # detect + embed
    for f in faces:
        tid = tracker.assign(f.bbox)        # simple IoU tracker or ByteTrack
        votes[tid].append(best_match(f.normed_embedding, gallery))
        if crossed_entry_line(tid) and decided(votes[tid]):
            publish("campus/B204/gate/event", envelope(...))
```

- **Broker:** install Mosquitto and set a `password_file` with one user per device. Use port 1883 for development and 8883 with TLS for the final demo.
- **Ingest worker** (`apps/ingest`, about 60 lines): subscribe to `campus/+/#`, validate the envelope, and call the Supabase RPC `apply_gate_event` with the service-role key. It runs on the same laptop.
- Run every component as a separate process: `python -m edge`, `python -m ingest`, `uvicorn` for the Face API. A single `start.bat` launches all three.

**Test:** walk through the door. A row appears in `gate_events`, your attendance becomes `present`, and the professor dashboard turns green. Measure how long it takes.

### Step 6 — Inside counting, live dashboard, mismatch + self-verify (week 7)

- **Counting:** `YOLO("yolov8n.pt")(frame, classes=[0], conf=0.4)`. Keep detections whose foot point is inside the seat polygon (`cv2.pointPolygonTest`), take the median of a `deque(maxlen=10)`, and publish every 10 s.
- **Live dashboard:** `supabase.channel("session:" + id).on("postgres_changes", { event: "*", schema: "public", table: "attendance", filter: "session_id=eq." + id }, onChange).subscribe()`.
- **Rule engine:** `pg_cron` runs `select session_tick();` every minute. That one SQL function starts and ends sessions, runs the mismatch check, opens recheck windows and inserts notifications (which trigger the pushes from step 3).
- **Self-verify page** (`/verify/[requestId]`): `navigator.geolocation.getCurrentPosition(cb, err, { enableHighAccuracy: true })`, a QR scan with `html5-qrcode`, and the face frame + liveness sent to `/face/verify`. The server checks all three and writes `verification_attempts`.
- **Room QR:** the token is `HMAC(qr_secret, session_id + floor(now / 20 s))`. The server accepts the current and previous slot to allow for scan delay.

**Test:** run demo steps 4–6 from the testing section.

### Step 7 — Recheck, final rules, appeals, reports (week 8)

- `finalize_session()`, `left_early`, professor override with reason, the appeal flow with file upload, attendance %, and CSV/PDF export.
- Write the attendance rules as SQL functions and test them with fixed timestamps (pgTAP, or Vitest calling the RPCs). Every row of the edge-case table becomes one test.

**Test:** the whole demo script runs start to finish without you touching the database by hand.

### Step 8 — IoT extras, hardening, report (weeks 9–10)

- **ESP32 actuator:** in the Arduino IDE with the `PubSubClient` library, subscribe to `campus/B204/gate/feedback` and light the LED green or red. This adds a real actuator to Cisco Layer 1, which IoT examiners look for.
- **Reliability:** SQLite offline queue, heartbeats, the device-health page, and auto-reconnect for camera streams.
- **Tuning:** record a 5-minute entry video with friends, replay it, and pick the threshold from the false-accept and false-reject numbers. Fill in the metrics table.
- **Report and slides:** organise them by the seven Cisco layers (one slide per layer: what device or software, what data, what protocol). Then add the architecture diagram, the session timeline, the metrics table and the limits. Finish with the live demo.

### What IoT examiners usually check

| They look for | Where you show it |
| --- | --- |
| Real sensors → edge → cloud data flow | Phone cameras → laptop edge → MQTT → Supabase |
| A standard IoT protocol | MQTT topics, QoS 1, TLS, per-device credentials |
| Edge/fog processing | Face recognition and counting on the laptop; only events leave the room |
| An actuator / feedback loop | ESP32 LED at the door; push notifications to phones |
| Data storage + visualisation | Postgres tables, the live professor dashboard, reports |
| Device management | Heartbeats, device-health page, key rotation |
| Security & privacy | RLS, consent, TLS, liveness, the data-retention policy |

### Pitfalls that cost students days

- **Phone camera sleeps or the stream drops:** in IP Webcam, disable screen-off, keep the phone charging, and lock focus and exposure.
- **Phone IP changes:** set a DHCP reservation on the router, or use the laptop hotspot.
- **Camera, GPS or push don't work on the phone:** you are on `http://`. Use the Vercel URL or the Cloudflare tunnel.
- **InsightFace won't install:** install the C++ Build Tools, use Python 3.11, and install `onnxruntime` before `insightface`.
- **Laptop too slow with both cameras:** run face detection at 640 px, process every 2nd frame at the gate and one frame every 3 s inside, and use `yolov8n` (not s/m).
- **Too many false alerts:** only stable counts (unchanged for 60 s) may trigger a mismatch; check the ROI mask doesn't include the doorway.
