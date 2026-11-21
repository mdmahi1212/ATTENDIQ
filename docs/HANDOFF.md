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
- step6-7 done: logo gradient-id bug fixed; lint ✓ tsc ✓ unit 125 ✓ build ✓ e2e 11/11 ✓; phone layout checked (tabs, More sheet, no overflow). Committed, NOT pushed.
- LEFT: run edge live view (config liveview.enabled true) + test; push when user says.
