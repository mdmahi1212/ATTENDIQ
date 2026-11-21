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
- NOW: browser check on session 95d46ca6-af15-46fc-b9be-7b8723c5b06f (2-camera test: Mahi present, Fahim left),
  then commit, then build the edge live labelled view (http://localhost:8090).
