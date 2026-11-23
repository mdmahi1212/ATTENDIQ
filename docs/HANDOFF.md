# HANDOFF — read this first when a session starts or after a context reset

Keep this short. Update it after every step. Details live in PROGRESS.md / CLAUDE.md.

## User preferences (2026-11-22)
- Minimise tokens: short replies, read only needed file parts, no long explanations.
- Do not change system behaviour unless asked; a "test" means run it, not modify code.
- Show results simply (tables); one step at a time when the user must act.
- User pushes via me only when they say "push".

## Current state (2026-11-22 ~03:50 KST)
- All phases built; gates 4-7 passed; Gate 8: tests ✓, Wi-Fi cut ✓, Cisco doc ✓, live demo mostly ✓ (see PROGRESS).
- New tonight (pushed, HEAD 522f72c): exit camera (presence/line mode), professor-only count alert at T_end-5,
  absent if left and never returned (`left_no_return`), YOLO11x counting, edge on RTX 3060 GPU (faces + YOLO).
- Laptop runtime (local, gitignored): broker 1884, face-api on 8010 (bowlersense holds 8000), ingest, edge.
  Edge config now: phone 1 (http://192.168.219.100:8080/video, rotate 270) = gate AND inside counter;
  exit camera disabled; iPhone (192.168.219.104:8081) disconnected.
- Accounts: admin@attendance.test / Admin1234; professor@attendance.test / Prof1234; students Mahi, fahim (both IOT401-01).

## In progress
1. Better professor dashboard: new page `apps/web/app/sessions/[id]/dashboard` — top numbers, room count vs present
   chart, door timeline, time-in-class per student (from door events only), device health; live via Realtime.
2. Then: live labelled camera view served by the edge at http://localhost:8090 (face boxes + initials + score,
   person boxes + count), live only, never stored.

## Next step
(update as you go)
- DONE (uncommitted): lib/dashboard.ts (+7 unit tests, 121 pass), app/sessions/[id]/dashboard/page.tsx, link
  "Live dashboard" on the class page. Lint + typecheck clean.
- DONE: dashboard committed 2fa206f (browser-checked). Was: browser check on session 95d46ca6-af15-46fc-b9be-7b8723c5b06f (2-camera test: Mahi present, Fahim left),
  then commit, then build the edge live labelled view (http://localhost:8090).
- Live view WIP (committed, NOT run yet): edge/liveview.py + wiring in __main__.py + config `liveview:`.
  NEXT: set `liveview: {enabled: true}` in apps/edge/config.yaml, restart edge, start a class, open http://127.0.0.1:8090,
  check boxes/labels; add unit test for face_label; pytest; update PROGRESS; push when user says.

## UI REDESIGN (started 2026-11-22, user request) — commit after each step
Plan: 1 tokens+logo+icons (globals.css, components/logo.tsx, public/icons) · 2 shell (app-shell, nav-links, lib/nav.ts icons+groups,
mobile top bar + bottom tabs + More sheet, page transition) · 3 admin dashboard (KPIs, 14-day chart, activity, devices) ·
4 professor dashboard (today, section rates, at-risk) · 5 student dashboard (rings, next class, recent) · 6 login page ·
7 lint/types/unit/build/e2e + browser desktop+mobile · commit. Keep existing data-testids and nav labels (e2e uses them).
Live view (edge) still not run — do after UI.
Progress:
- step1+2 done: theme/logo/icons/auth page/shell (sidebar, mobile tabs+More sheet, transitions)
- step3-5 done: admin/professor/student dashboards + components/dash.tsx + lib/stats.ts (4 tests). NEXT: browser check prof + mobile, then full lint/unit/build/e2e, fix, commit
- step6-7 done: logo gradient-id bug fixed; lint ✓ tsc ✓ unit 125 ✓ build ✓ e2e 11/11 ✓; phone layout checked (tabs, More sheet, no overflow). Committed and pushed (13f3a4d); Vercel prod READY at attendiq-rho.vercel.app.
- LEFT: run edge live view (config liveview.enabled true) + test; push when user says.
- 2026-11-23: cloud session's recorded-video demo (PR #1+#2, 13 commits) REVERTED here (user: build the demo here, live phones).
  Tests back to edge 38 / web 125, tsc clean. Revert commit local, NOT pushed (user must say push).
  NEXT: live 2-phone class here: phone 1 gate (outside), phone 2 inside (count + exit), liveview on, Mahi + Fahim.
- 2026-11-23 VIDEO DEMO (built here): Admin -> Sections -> "Video demo class (10 min)" (lib/demo.ts demo policy: present 2,
  late until 8, checks from 2 every 2, tolerance 0, alert at 7) + `scripts/run-video-demo.ps1 -Door x -Room y`
  (edge --direct --demo: waits for live class, plays both videos together, holds last frame, exits at class end).
  Camera settings for recordings: apps/edge/config.demo.yaml (gitignored; make it after seeing the videos: rotation,
  exit line, seat ROI). Edge 39 tests, web 128, lint/tsc/build ok. NOT yet run with real recordings.
  Scenario (Mahi + Fahim, ~9 min): 0:30 Mahi in; 3:00 Fahim in (late); 5:00 Mahi out, 5:40 back; 6:30 Fahim out for good.
- 2026-11-23 Admin -> Demo page (/admin/demo): per section 5 / 10 / 15 min (demo timing, lib/demo.ts demoPolicy(m)) or
  Full class (timetable length, normal rules); "Running now" list with Open class / Live dashboard; timing table;
  how-to (live phones or recorded videos). DB: create_adhoc_session allows 5..240 min (migration
  20261122181258, applied; checked in a rolled-back test). Sections page button removed (moved to Demo).
  Checks: web unit 131, tsc, lint, build; page checked desktop + 375 px. Start buttons NOT clicked (would start a real class).
- 2026-11-23 INSTRUCTIONS.md has 5-person plans for a 10-min and a 5-min class. When making apps/edge/config.demo.yaml
  for the recordings, set inside.stable_count_seconds ~20 (config.yaml has 60; too slow for the 5-min class).
- 2026-11-23 ONE-CLICK DEMO: demo\START-DEMO.bat -> python -m edge.demo: finds door*/room* pairs in demo\videos,
  length from video (<=6 min -> 5, <=11 -> 10, else 15), starts face-api (port 8010) if down, POST
  /api/edge/v1/sessions/demo-class (edge key; section in the device's room; 5/10/15 min; lib/demo-class.ts shared with
  Admin -> Demo), opens live view + /sessions/<id>/dashboard, runs edge --direct --demo. NOT yet run end to end
  (route needs a push; a run starts a real class).
- 2026-11-23 START-CLASS.bat (scripts/start-live.ps1): checks phones, starts broker/face-api/ingest/edge (reuses running
  ones), opens live view + site. Ran it: all 4 up, models on GPU. Live view: simulated ESP32 LED (/led.json).
  Body exit (edge/bodyexit.py, exit.body_tracking true, line mode + inside enabled): YOLO body tracks carry the identity
  of faces seen inside them (>=2 sightings); body crossing the exit line -> GATE_PERSON_OUT (student or unknown);
  GatePipeline.report_out dedupes unknown OUT within 3 s of another OUT. 49 edge tests. NOT verified with real people.
- 2026-11-23 user decisions: (1) body-named exits stay (face seen earlier in class -> body crossing exit = that student
  OUT -> absent if not back), accepted risk of swapped tracks; (2) door camera tracks bodies too: DoorBodyWatcher ->
  GATE_ENTRY_UNKNOWN {via body, face not seen} + LED red when a body >=1 s never shows a face. One shared YOLO model
  (lock) for door + room. Edge 52 tests; restarted OK. NOT verified with real people.
- 2026-11-23 NEXT BUILD (user approved, one by one, commit each, push only on "push"):
  upgrades #2 draw exit line + seat area on website (camera snapshot, saved in DB, edge fetches) -> #1 BoT-SORT ReID
  body tracking -> #3 door anti-spoof (liveness.onnx on door faces) -> rules E (door-marked student must be seen by the
  room camera, else 'unconfirmed' for professor review) + B (self-verify counts only if room camera sees that face
  within 10 min, else 'unconfirmed') -> C (unknown face sitting in room = professor-only live alert, never stored) ->
  F (one registered phone per student; change needs admin) -> #4 room map + time in class from body tracks ->
  #5 AI class summary (Claude API) for professor. NOT chosen: A (min time %), G (pattern warnings), H (appeal limit).
- 2026-11-23 #2 DONE (local commit): cameras.exit_line/door_point/snapshot_at (migration 20261122190157, applied);
  edge GET /api/edge/v1/cameras + POST /cameras/{gate|inside}/snapshot; edge/geometry_sync.py applies website geometry
  every 60 s, SnapshotSender every 120 s; editor modes Seat area / Exit line / Door side; demo\SETUP-CAMERAS.bat.
  Tested against local dev: snapshot upload, draw + save in editor, edge plan() -> out_side 1. Test geometry cleared.
- 2026-11-23 #1 DONE (local commit): BoT-SORT + ReID (apps/edge/trackers/botsort-reid.yaml, model auto = YOLO features)
  one YOLO per camera (ids live in the model); IdTracker feeds BodyExitTracker / DoorBodyWatcher; falls back to IoU if
  tracking fails. Real check: 6 people in the InsightFace sample kept ids 1-6 over 4 frames on GPU. lap==0.5.14 pinned
  (Ultralytics auto-installed it). Edge 58 tests.
- 2026-11-23 #3 DONE (local commit): door anti-spoof = InsightFace liveness addon (face-api/models/addons/liveness.onnx)
  in the edge detector (observe mode, GPU); gate.live_threshold 0.3 (median over >=2 crops) -> GATE_ENTRY_UNKNOWN
  {spoof, matched} + LED red; every decision logs live_score (tune after real tests). Real picture scores 0.91-0.99.
- 2026-11-23 rules E+B+C DONE (local commit): migration 20261122193723 (applied): event types ROOM_SEEN /
  ROOM_UNKNOWN_FACE; apply_edge_events alerts staff 'unknown_in_room' (max 1 per 5 min, not for simulations);
  finalize flags 'unconfirmed' (gate: no ROOM_SEEN after first_seen_at; self_verify: none within -2..+10 min) only
  if the class had any ROOM_SEEN; staff notified. Edge roomwatch.py (ROOM_SEEN 1/min/student; unknown after 5 frames
  in 10 s with best < 0.30, 1 per 2 min). Web: pills 'not seen in room', 'left, not back'; dashboard banner.
  Rolled-back SQL test: 2 events accepted, 1 alert, fahim unconfirmed, mahi clean. Edge 64, web 133.
- 2026-11-23 rule F DONE: table student_devices (migration 20261122194154, applied; RLS own/admin read, admin delete;
  audited). verify route needs meta.device_id (localStorage id; SHA-256 stored); first verify registers, other phone
  -> 403 wrong_device; Admin -> People -> Reset phone. Web unit 136.
- 2026-11-23 #4 DONE: OCCUPANCY_UPDATED payload.people [{x,y feet 0..1, student_id?}] (edge/roommap.py, name from body
  tracker identity); live dashboard 'Room map' card (latest occupancy edge_event via admin client after requireRole).
  Body-based time-in-class NOT built (door-event time stays). Edge 66, web 138.
- 2026-11-23 #5 DONE: class_sessions.summary/summary_at (migration 20261122194558, applied); lib/class-summary(.ts|-ai.ts),
  lib/class-facts.ts; class page 'Class summary -> Write summary' (ended classes). Claude claude-opus-5-5, effort low,
  fallbacks "default" (beta server-side-fallback-2026-07-01) when ANTHROPIC_API_KEY set; else template. Browser-checked
  template path on session 95d46ca6 (summary saved there). Claude path NOT run (no key). @anthropic-ai/sdk 1.12.0.
- 2026-11-23 FINAL ROUND (all pushed): ROOM_SEEN marks pending students (method room; migrations 20261122200243/200320,
  checked rolled back); edge tiles 2x2 on room camera, BoT-SORT buffer 300, ExitFusion two-camera exit, door leaving
  (leaving_shrinks); verify 'tap your seat' (lib/verify/seat.ts, /api/verify/[id]/seats), QR backup; admin quick
  actions + review count, professor 'Needs your review', student 'Verify phone'; SimpleCreateForm card; Sections test
  buttons -> Admin -> Demo. Checks: web unit 143, e2e 11/11 (prod build), edge 69, face-api 20, ingest 7, sim 11,
  pycommon 5, lint/ruff/tsc/build clean. NOT verified with real people (videos tomorrow).
- 2026-11-23 CAMERAS AUTO: GATE/INSIDE_CAMERA_SOURCE=auto (.env + example). edge/discover.py scans this laptop's private
  /24 networks (ports 8080/8081/4747, keeps MJPEG/JPEG answers; ~2.3 s), every 2 min while a camera lacks a working
  address; edge/sources.py: website cameras.stream_url > .env address > found (door first, room next). Camera.set_source
  switches live. Heartbeat status.cameras {found, sources, online}. Website Operator -> camera: 'Camera address' (Use
  found / type / back to automatic). Laptop was on 172.16.71.0/24 while old addresses were 192.168.219.x.
- 2026-11-23 DATA: 'Confirm email' OFF in Supabase (user) - sign-up tested on localhost: straight to /student, no email.
  Deleted (user request, confirmed): 30 simulated students + 21 simulation sessions (cascade: 1,060 attendance, 40
  enrollments) + 'Signup Test' + 'Duplicate Test Student' (+ its face-review photo via storage API). Kept: Demo Admin,
  Prof. Demo Kim, Mahi, fahim, Ahammed Tanim, Nahid Hasan, E2E Admin, E2E Student. Simulator / Gate 7 live test now
  have no SIM students (seed.sql recreates them on a fresh DB).
- 2026-11-24 DEMO RUN (session bcaf3803, 7-min class, door.mp4 59 fps + room.MOV 30 fps, 6 min): 6 marked present
  (1 gate, 5 room), Mahi/fahim absent (not in videos); 0 OUT events -> 2 leavers stayed present. Cause: door not in
  room picture; exit line drawn on the bottom edge, door dot on room side. Fix: edge line -> out = beyond that edge
  (edge_outside), body 'edge_mode': settled (>=15 s, started away from side/bottom edges) named body that walks out
  at left/right/bottom edge = OUT. Replay of room.MOV: exactly 2 exits, 1:52 and 4:12 (0 false). Edge 79 tests.
  Also fixed: camera pages crashed (client component); e2e live tests use temp SIM student.
- 2026-11-24 DOOR SLOW: in the demo the door analysed ~4 fps (heartbeat frames 50 in 13 s) because the room camera's
  tiled face search (133 ms/look, 4 tiles) held the shared face model and the door skipped every 2nd frame; walk-ins
  show a usable face ~2 s (70->200 px, checked frame by frame) -> tracks fragmented, only 2 of ~9 decided.
  Fix: exit.max_fps 2 (room face looks/s), gate.process_every_nth 1 (config.py default + config.yaml/example).
  GPU benchmark: door face 35 ms, room tiled 133 ms, yolo 25 ms -> door ~20 fps. NOT yet re-run with the videos.
- 2026-11-24 DEMO RE-RUN (session 28283085): door recognised 3 (Tanim 0:13, jidan 0:29, Jjjj 0:43; ~9 fps vs ~4).
  OUT: Fahad 2:04 -> absent left_no_return (correct), jidan 4:30 -> back at the door -> present (door video shows a
  person returning at 5:00), Jjjj 0:50 (wrong, corrected by later sighting -> present). Result: present Tanim, jidan,
  Jjjj, Sourav, Nahid; absent Fahad (left), Mahi, fahim (not in videos).
  New bug found + fixed: recorded video played slow under load (door event at class 6:11 = video 5:00, ~1 min lag);
  Camera now follows the wall clock and skips frames when behind (test added; edge 80). Not re-run after this fix.
- 2026-11-24 USER TRUTH for the demo videos: present all class Fahad, Sourav; Tanim + Refat(Jjjj) left and came back;
  Nahid came and left (never back); jidan left, showed his face at the door again but did not come in; Mahi/fahim not
  there. System had: Fahad absent (wrong: the 1:52 leaver was Nahid, named Fahad by overlapping body boxes), Nahid
  present (wrong), jidan present (wrong: door sighting after OUT counted as return).
  Fixes: bodyexit._vote (each face votes for ONE body, head area; name needs >= 2x runner-up), migration
  20261123160306 (applied): after an OUT, return needs ROOM_SEEN / phone verify / staff, door alone only if no room
  camera that class (rolled-back test: jidan absent, Tanim present). Edge 82 tests. NOT re-run with the videos yet.
- 2026-11-24 FINAL ROOM CHECK: migration 20261123161411 (applied): class_sessions.final_check_requested_at /
  final_check / final_check_at, request_final_check() (staff), record_final_check() (service; compares with marks,
  notifies staff), current_session_for_room returns the request. Edge finalcheck.py (30 s: median seated count,
  faces >= 2 sightings, body names; room faces 4/s during the check), poll 5 s in class, POST
  /api/edge/v1/sessions/[id]/final-check. Web: End session = request -> panel (auto refresh) -> End again closes;
  'End now without check'; lib/final-check.ts endStep. Hardening: single edge lock (127.0.0.1:47811),
  start-classroom restarts edge/ingest after a crash. Tests: edge 84, web 155. Rolled-back SQL test OK.
- 2026-11-24 DEMO RUN 3 (session d7b40000) + RULE G: result Fahad present (OUT 2:04 still wrongly named Fahad, but the
  room camera saw him after -> kept present), Nahid + jidan present (WRONG: no OUT was ever named for them). Migration
  20261123163332 leavers_not_named (applied): finalize rule G - with room recognition and end count (final check, else
  median of the last 2 min, minus staff_count) below the number marked present, the students the room camera stopped
  recognising longest ago (>= max(90 s, 4% of the class) before its last recognition, nothing newer) -> absent
  left_no_return, at most the shortfall; staff notified. Replay of d7b40000 (rolled back) = exactly the user truth
  (present Tanim, Fahad, Jjjj, Sourav; absent Nahid, jidan, Mahi, fahim). SQL test G added (8 checks pass, rolled
  back). Still open: body->name voting swaps neighbours (Nahid/Fahad) in the demo video; room count undercounts (max 4
  of 6). The final check during demo must run BEFORE the videos end (held last frame = no new faces).
- 2026-11-24 DOOR CUTOFF (user decision): door recognition marks attendance only until policy door_marks_until_min
  (default 15; demos = late_until_min). Migration 20261123164034 (applied; patches apply_edge_events in place, adds
  the key to settings.policy): later door sightings are stored and still give reentry / return-after-OUT, but do not
  mark unmarked students (room camera / phone do). Web: policySchema key (default 15), settings form field, demo table
  row. SQL test H (6 checks pass, rolled back); web 155 unit tests, lint, typecheck OK.
