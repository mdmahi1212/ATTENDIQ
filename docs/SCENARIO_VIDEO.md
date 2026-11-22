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

## Replay on the laptop

1. Copy the files to `apps/edge/samples/` (gitignored: faces), e.g. `scene-in.mp4` and `scene-out.mp4`.
2. `apps/edge/config.yaml`: `exit.enabled: true`, `exit.mode: presence`; `inside.enabled: false`;
   `gate.rotate: 0` and `inside.rotate: 0` for landscape files (the live phone rotations do NOT apply to files).
   Optional: `liveview.enabled: true` to watch the boxes and names at http://127.0.0.1:8090.
3. Start a live session in B204: Admin → Sections → **Start 30-min test session** (or "Demo: class started
   12 min ago" to make every arrival `late`).
4. Run (no broker needed with `--direct`):

   ```powershell
   cd apps\edge
   .\.venv\Scripts\python.exe -m edge --direct --presence `
     --video samples\scene-in.mp4 --video-offset 3.4 `
     --exit-video samples\scene-out.mp4 --exit-offset 1.2
   ```

   The edge waits until it sees the session, then starts BOTH files together at real-time speed and exits
   when both have ended.
5. Watch the professor's **Live dashboard** for the class (door timeline, statuses). Then press **End session**
   and check the final statuses above.
6. For the presentation video, screen-record the live dashboard (and the 8090 live view) during the replay.

Re-run: Admin → reset demo data (`scripts\reset-demo.ps1`) or start a new test session; every session starts
with an empty "who is inside" memory.

## A short class (5–10 minutes)

- Start **Start 30-min test session** and simply press **End session** on the live page after 5–10 minutes:
  End session finalizes at once (statuses above), you do not have to wait for the 30 minutes.
- Within the first 10 minutes (`present_until_min`) every recognised arrival is `present`. To show `late`, use
  "Demo: class started 12 min ago" instead (arrivals then fall in the 10–30 min late window).
- With `--direct` the edge finds the session by polling every 15 s, so playback starts up to 15 s after you start
  the session. Start the session first, then the edge (or the other way round: the edge waits).
- When the recordings end the edge exits WITHOUT reporting the cameras offline (a finished file is not a camera
  failure; otherwise the downtime check at End session would put the never-came student in `needs_review`
  instead of `absent`). You can press End session any time after the edge has finished.
- The professor's end-of-class count alert (T_end − 5 min) does not fire when you end a 30-min session early;
  that is expected.

## Optional: phone verification in the same video

While the replay runs, the professor can press **Start recheck** on the live page; a real enrolled phone gets the
push and verifies (QR + face + liveness) live. Students who ignore it become `left_early`. This part cannot come
from a recording: it needs the real phone.
