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
