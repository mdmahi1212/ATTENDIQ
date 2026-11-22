# Scenario video: friends walk in, leave, come back (recorded, replayed into a live class)

**Easiest way:** put `door.mp4` (phone 1) and `room.mp4` (phone 2) in the repo's `demo\` folder and double-click
`demo\START-DEMO.bat` (see `demo\README.md`). The rest of this page explains
what those do and how to film.

Two phones record the scene at the same time, exactly where they stand in the live setup. Later the edge plays
both recordings into a live session as if they were the cameras. The system makes every decision itself:
present, unknown, left and came back, left and never came back (absent).

| Phone | Stands | Sees | Used for |
|---|---|---|---|
| Phone 1 | **outside** the door, head height, facing the people coming to the door | faces of people walking IN | entry → present / late, re-entry |
| Phone 2 | **inside** the room, near the door, looking into the room | the whole room + faces of people walking to the door | people count + exit (crossing the exit line toward the door) |

## Before filming

1. Every friend who should be recognised needs an account, must be enrolled in **IOT401-01**, and needs an
   **active** face profile (enroll on `/student/face`; approve it in Admin → Faces if it went to review).
   Keep one friend NOT enrolled as the stranger.
2. Record in **landscape**, 30 fps, normal camera app. iPhone: Settings → Camera → Formats → **Most Compatible**
   (H.264; OpenCV may not read HEVC). Good light, faces visible, normal walking speed.
3. Phone 2 uses the **exit line**: a person only counts as leaving when their face crosses a line drawn just in
   front of the door in phone 2's picture, moving toward the door. Students sitting in their seats never cross
   it, so phone 2 can count the room at the same time.

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

## Full demo class (same as a real class, 10 minutes)

Your two phones, every rule of a real class, compressed timing. Use this for the class presentation.

| Phone | Films | Used for |
|---|---|---|
| Phone 1 | outside the door: people coming in | entry recognition → present / late, re-entry |
| Phone 2 | inside the room: the seats and the way to the door | people count (YOLO11x) → count checks, and exit (exit line) → left |

**Demo timing** (only this class; real classes keep the normal policy): present until **2 min**, late until **5 min**,
count check from **minute 2**, then every minute (push "verify now" to unmarked students, 3 min to answer),
professor's end-of-class count alert **2 min before the end**. The class ends **by itself** at its scheduled end
and is finalized by the server exactly like a timetable class. The rule engine runs once a minute, so things
can show up to ~1 min after they happen in the video.

### Script (record ~9 minutes; clap once at the start in view of both phones)

One friend plays the professor and sits in phone 2's view the whole time (`--staff 1`, the default).

| Time | Who | Action | What the system does |
|---|---|---|---|
| 0:10 | A | walks in | green LED, **present** |
| 0:20 | B | walks in | **present** |
| 0:30 | C | walks in | **present** |
| 0:40 | X | walks in looking down / hood up (face not seen) | nothing: X stays pending |
| 0:50 | E (not enrolled) | walks in, looks around, leaves at 1:20 | red LED, unknown person |
| 1:20 → | everyone | sit still in phone 2's view | room count becomes stable |
| ~2:00–3:00 | — | count 4 > 3 marked | **"Verify now" push** to the unmarked students |
| live | X | during the presentation, verifies on their phone: face + blink/turn + scan the room QR on the professor's live page | X → **present** |
| 3:00 | L | walks in | **late** (after 2 min) |
| 4:00 | B | walks out | amber LED, B left |
| 4:45 | B | walks back in | re-entry, B stays present |
| 6:00 | C | walks out and does not come back | amber LED |
| ~8:00 | — | end-of-class check: 4 in the room, 5 marked present | **professor alert** "Count does not match" |
| 9:00 | — | stop both recordings | the class keeps running |
| 10:00 | — | class ends by itself | **final:** A, B, X present · L late · C absent (`left_no_return`) · D (never came) absent |

Do NOT press Start recheck after the professor alert in this demo: A, B and L are on video, not in the room with
their phones, so they could not answer and would become `left_early`. Show the alert instead. (Press it only
if everyone marked present is really in the presentation room with their phone.)

### Run it

```powershell
# real network path, same as a real class: Mosquitto + ingest + face API (close the live edge window it opens)
powershell -ExecutionPolicy Bypass -File scripts\start-classroom.ps1 -MqttPort 1884
cd apps\edge
.\.venv\Scripts\python.exe -m edge --presence --start-session --full-class --section IOT401-01 `
  --video samples\door.mp4 --video-offset 3.4 `
  --exit-video samples\room.mp4 --exit-offset 1.2
```

(`--room-video` exists for a third phone that only films the seats; you do not need it.)

On screen: http://127.0.0.1:8090 (door camera, room camera with the people count, way-out view with the exit line, door LED) next to the professor's live page
(statuses, room count, door timeline, room QR). X needs their own phone with the AttendIQ app and notifications on.
The edge prints the final table when the server has ended the class.

`config.yaml` for this run:

```yaml
gate:
  rotate: 0              # landscape recordings
  entry_mode: presence   # phone 1 outside only sees people coming in (same as --presence)
inside:
  enabled: true          # phone 2 counts the room
  rotate: 0
  roi: [[0.0, 0.3], [1.0, 0.3], [1.0, 1.0], [0.0, 1.0]]   # seat area of phone 2's picture
exit:
  enabled: true
  mode: line             # NOT presence: seated students face phone 2 and must not count as leaving
  line_a: [0.25, 0.0]    # a line just in front of the door, top to bottom
  line_b: [0.25, 1.0]
  out_side: 1            # door on the LEFT of phone 2's picture; -1 if it is on the right
liveview:
  enabled: true
```

Set the line from your recording: open the live view, the exit line is drawn in amber on the way-out view.
It must lie between the seats and the door, so everybody going out crosses it and nobody seated does.
Test it once with yourself (walk out → amber LED, sit down → nothing) before filming the friends.

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
- `apps/edge/config.yaml`: as in "Full demo class" above (`exit.mode: line`); for a run without the room count
  `inside.enabled: false`;
  `gate.rotate: 0` and `inside.rotate: 0` for landscape files (the live phone rotations do NOT apply to files).
  `liveview:` `enabled: true` to show the boxes, names and the **virtual door LED** at http://127.0.0.1:8090.
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

## Virtual door LED (no ESP32 needed)

http://127.0.0.1:8090 shows the camera views and, beside them, a simulated ESP32 door LED with an event log.
It lights for 1.5 s, like `firmware/esp32-door-led`:
- **green** + initials: the student was recognised and the attendance was recorded (`GATE_ENTRY_RECOGNISED`)
- **red**: unknown person at the door (`GATE_ENTRY_UNKNOWN`)
- **amber** + initials: a recognised student left the room (`GATE_PERSON_OUT`)

It is driven by the same events the edge sends to the server, so it also works with `--direct` (no MQTT).
The gallery holds initials only (privacy), so the LED shows initials. Screen-record this tab next to the
professor's live dashboard for the presentation video.

## Optional: phone verification in the same video

While the replay runs, the professor can press **Start recheck** on the live page; a real enrolled phone gets the
push and verifies (QR + face + liveness) live. Students who ignore it become `left_early`. This part cannot come
from a recording: it needs the real phone.
