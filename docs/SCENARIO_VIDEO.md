# Scenario video: friends walk in, leave, come back (recorded, replayed into a live class)

Two phones record the scene at the same time, exactly where they stand in the live setup. Later the edge plays
both recordings into a live session as if they were the cameras. The system makes every decision itself:
present, unknown, left and came back, left and never came back (absent).

| Phone | Live role | Stands | Sees |
|---|---|---|---|
| Phone 1 | gate / way-in camera | inside the room, ~2–3 m from the door, head height, looking AT the door | faces of people walking IN |
| Phone 2 | way-out camera (exit, `mode: presence`) | beside the door, looking INTO the room | faces of people walking OUT |

## Before filming

1. Every friend who should be recognised needs an account, must be enrolled in **IOT401-01**, and needs an
   **active** face profile (enroll on `/student/face`; approve it in Admin → Faces if it went to review).
   Keep one friend NOT enrolled as the stranger.
2. Record in **landscape**, 30 fps, normal camera app. iPhone: Settings → Camera → Formats → **Most Compatible**
   (H.264; OpenCV may not read HEVC). Good light, faces visible, normal walking speed.
3. Nobody who is already inside may look into phone 2 (in presence mode every recognised face it sees = OUT).
   Seat the friends behind or beside phone 2.

## Script (start both phones recording, then clap once in view of BOTH phones)

| Time after clap | Who | Action | Expected result |
|---|---|---|---|
| 0:05 | A | walks in | `present` (gate) |
| 0:15 | B | walks in | `present` |
| 0:25 | C | walks in | `present` |
| 0:35 | E (not enrolled) | walks in | `GATE_ENTRY_UNKNOWN` (unknown entrant) |
| 1:00 | B | walks out past phone 2 | `GATE_PERSON_OUT` for B |
| 1:30 | B | walks back in | re-entry reported; B stays `present` |
| 2:00 | C | walks out, does NOT come back | `GATE_PERSON_OUT` for C |
| 2:30 | – | stop both recordings | |
| — | D (enrolled) | never comes | `absent` at End session |

At **End session**: A present, B present, C **absent** (`left_no_return`, "left at … and did not come back"),
D absent, plus one unknown-entrant row. Keep gaps of ≥10 s between people so each face is a separate track.

## Line the two recordings up

Open each file in any player and note the second of the clap (e.g. phone 1 at 3.4 s, phone 2 at 1.2 s).
Skip the earlier part of the one that started first, so both start at the clap:
`--video-offset 3.4 --exit-offset 1.2`.

## Presentation mode: one command, the class starts and ends with the videos

```powershell
cd apps\edge
.\.venv\Scripts\python.exe -m edge --direct --presence --start-session --section IOT401-01 `
  --video samples\scene-in.mp4 --video-offset 3.4 `
  --exit-video samples\scene-out.mp4 --exit-offset 1.2
```

What happens:
1. The edge reads the video length and starts a **real** class for the section in its room (scheduled for the
   video length + 2 min, at least 10 min). Real students get `pending` rows, exactly like a timetable class.
2. Both videos start at that same moment and play at real-time speed through the full pipeline (face detection,
   tracking, recognition votes, door events → API → rule engine). Open the professor's **Live dashboard** and
   watch statuses change while the video plays.
3. When both videos finish, the edge waits until every event has reached the server, then **ends + finalizes**
   the class (leaving-and-never-returning → `absent`, never came → `absent`) and prints the final table:

   ```
   Final attendance
   Student  Status    Flags / note
   A        present
   B        present
   C        absent    left_no_return  left at 10:02 and did not come back
   D        absent
   Unknown people at the door: 1
   ```

One-time setup:
- **Server switch** (off by default, because it lets the laptop's device key start and end real classes):
  `EDGE_REPLAY_SESSIONS=true` in `apps/web/.env.local`, then `node scripts/push-vercel-env.mjs` and redeploy
  (or set it in Vercel → Project → Settings → Environment Variables). Set it back to `false` after presenting.
- `apps/edge/config.yaml`: `exit.enabled: true`, `exit.mode: presence`; `inside.enabled: false`;
  `gate.rotate: 0` and `inside.rotate: 0` for landscape files (the live phone rotations do NOT apply to files).
  Optional: `liveview.enabled: true` to show the boxes and names at http://127.0.0.1:8090.
- Copy the files to `apps/edge/samples/` (gitignored: faces).

Good to know:
- **Every real student enrolled in that section** who is not in the video ends `absent` and gets a "Marked absent"
  notification. For the presentation use a section that only contains your friends (or warn the others).
- No other real class may be live in the room (the edge stops with "another live session is running").
- Ctrl+C during playback leaves the class live; end it on the live page.
- All arrivals in the first 10 minutes are `present`. Recheck alerts (T_end − 5) do not happen in such a short
  class; for recheck, press **Start recheck** on the live page during the replay (needs a real phone).
- The end of a recording is not reported as a camera failure, so the device-health check at the end passes and
  no-shows become `absent` instead of `needs_review`.
- Without `--start-session` the edge waits for a class you started on the website and you end it yourself.

Re-run: just run the command again (each run is a new class with an empty "who is inside" memory). Clean up old
runs with `scripts\reset-demo.ps1`.

## Optional: phone verification in the same video

While the replay runs, the professor can press **Start recheck** on the live page; a real enrolled phone gets the
push and verifies (QR + face + liveness) live. Students who ignore it become `left_early`. This part cannot come
from a recording: it needs the real phone.
