# Testing

All commands are for Windows PowerShell from the repo root unless noted. Use `npm.cmd` / `npx.cmd` if script
execution is disabled.

## Automated suites

| Suite | Command | What it covers | Last result |
|---|---|---|---|
| SQL (pgTAP, each file in one rolled-back transaction) | `scripts\test-db.ps1` (needs `SUPABASE_DB_URL` in `.env`) or paste a file into the Supabase SQL editor | `rule_engine` (95: timing, re-entry, replay, camera miss + self-verify, recheck/left early, camera offline fail-safe, gallery, cancelled sessions, tick/holidays/lock, RLS), `manual_mark` (9), `appeals` (19), `rls_matrix` (13 checks / 62 probes over every table and role), `privacy_ops` (9) | all pass |
| Web unit (Vitest) | `cd apps\web; npm test` | roles/guards, zod schemas, CSV, geometry, push, liveness state machine, capture plan, enrollment rules, edge schemas, QR tokens, verify decision, live counters, student helpers, MFA rule | 114 pass |
| Web e2e (Playwright, starts `npm run dev`) | `cd apps\web; npm run e2e` | access control, admin course→section→enrollment, Realtime inbox, live session page update without reload + room QR, appeal → approve → audit, reports/CSV, settings | 10 pass |
| Web e2e against the production build (CSP on) | `npm run build; npx next start -p 3100`, then `$env:E2E_BASE_URL='http://localhost:3100'; npx playwright test` | same 10 + headers | 10 pass, 0 console errors |
| face-api | `cd apps\face-api; .\.venv\Scripts\activate; ruff check .; pytest` | quality gates, API auth/limits, real buffalo_l model (same person vs others), passive liveness on real faces | 20 pass |
| edge | `cd apps\edge; ...; pytest` | line crossing, tracker, voting rule, dedupe/re-entry, gallery refresh, outbox offline replay/idempotency/restart, camera reconnect, gate pipeline, occupancy ROI/median/stability, real InsightFace walk-in, real YOLOv8n count | 31 pass |
| ingest | `cd apps\ingest; ...; pytest` | batching, ack-after-store, backoff, redelivery idempotency, invalid payloads, control commands | 7 pass |
| simulator | `cd apps\simulator; ...; pytest` | script expansion, expectations, occupancy, mismatch script, compare | 11 pass |
| **Gate 7 live** | `cd apps\simulator; $env:SIM_LIVE='1'; .\.venv\Scripts\python.exe -m pytest tests\test_gate7_live.py` | full `demo.yaml` class → finalize → every student compared | pass (22 present / 5 late / 3 absent, 0 differences) |
| pycommon | `cd packages\pycommon; ..\..\apps\ingest\.venv\Scripts\python.exe -m pytest` | envelope schema, topics, clock offset | 5 pass |

Lint / types: `npm run lint`, `npm run typecheck` (web); `ruff check .` (each Python app).

## Metrics (measured in this project; small samples — state them as such)

| Metric | Result | How measured |
|---|---|---|
| Gate: genuine match score | 0.78–0.79 (5/5 crops agree) for the enrolled student walking in | live test 2026-11-18, phone #1 → edge, threshold 0.45 |
| Gate: impostor scores | 0.15–0.18 for a face whose enrollment did not match; −0.03 for an unrelated face | live test + synthetic walk video |
| Duplicate enrollment detection | same person on 2 accounts: 0.90 → flagged `review`; different person: active | Gate 4 |
| Self-verify 1:1 face | 0.885–0.90 (threshold 0.50) | 3 live attempts on the user's phone |
| Liveness on attacks | printed photo: stopped by the browser challenges 2/2 after the fix; server anti-spoof model scored 0/59 printed-photo frames as live (median 0.01). Real face via phone: 0.998–0.999. (Before the fix one printed photo passed — see PROGRESS Gate 6) | live tests |
| Occupancy count | 6/6 people at 3 image scales on the InsightFace sample photo (MAE 0); laptop webcam with 1 person: stable count 1 after 60 s | `apps/edge/tests/test_real_yolo.py` + live test |
| Gate FAR / FRR | **not measured on a real set yet** — run `scripts/face-eval.py eval` with 2+ people × 5+ photos (`docs/face-eval.md` is only a pipeline smoke test) | — |
| Tracker ID switches | not measured on real footage (unit tests only) | — |
| End-to-end latency | **0.99 s** from the edge seeing the face to `present` in the DB (production, live test) | `edge_events.received_at − observed_at` with the clock offset corrected |
| Outage | 60 s API outage + ingest crash: 112/112 events delivered after recovery in 6.5 s; edge outbox replay after a broker outage verified (1 queued event replayed) | Phase 8 / Phase 5 tests |
| Edge FPS / CPU | gate stream 59–60 fps read, detection on every 2nd frame; CPU 75–80 % on this laptop with both cameras | heartbeat payloads |
