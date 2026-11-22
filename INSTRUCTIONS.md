# INSTRUCTIONS — everything you have to do, in one place

Kept up to date after every change. Short steps only. Setting up a brand-new laptop: `README.md` (Quick start).
Accounts and passwords are NOT written here (this repo is public): use the ones you already have.

---

## 1. Tomorrow: film the demo videos (5 people, 2 phones, about 9½ min)

### Before filming (do this first, about 5 min per new person)
1. Laptop: start the face API so new faces can be enrolled:
   `powershell -ExecutionPolicy Bypass -File scripts\start-face-api.ps1`
2. Each new person, on their own phone: open https://attendiq-rho.vercel.app → **Student sign up** → then
   **Face enrollment** (follow the camera steps) → turn **notifications on** when asked.
3. Admin (website): **Admin → Enrollments** → add all 5 to **IOT401-01**.
   Check **Admin → Face enrollment**: all 5 show **active**. (Mahi and Fahim are already done.)
4. Decide who is **Person 1–5** (table below). Person 4 keeps their phone in their pocket during filming
   and brings it to the presentation.
5. Both filming phones: charged, **at least 2 GB free**, camera set to **1080p, 30 fps** (not 4K, not 60 fps).
   Put each on a stand (or stack of books) so it stays **completely still**; nobody holds them.

### Where the phones go
| Phone | Where | Points at | Hold it |
|---|---|---|---|
| **Phone 1** (door video) | **outside** the door, at head height, 1.5–2 m from the door | the faces of people walking **in** | **landscape**, still |
| **Phone 2** (room video) | **inside** the room, beside the door | the seats **and** the door, so it sees everyone sitting and anyone walking out | **landscape**, still |

Good light on faces. No window behind the people (backlight hides faces). All 5 seats must be inside phone 2's picture.

### What happens (press record on both phones at the same moment: "3-2-1-record")
| Video time | Who | Does | Result in the system |
|---|---|---|---|
| 0:00 | — | both phones recording; nobody in view | class starts |
| 0:20 | **Person 1** | walks in **facing phone 1**, slowly, sits | **present** |
| 0:40 | **Person 2** | walks in facing phone 1, sits | **present** |
| 1:00 | **Person 3** | walks in facing phone 1, sits | **present** |
| 1:20 | **Person 4** | walks in **looking down at their phone** (face hidden from phone 1), sits | not marked: the room camera sees 4 people but only 3 are marked |
| 2:00 | — | (nothing to do) | the system sends **"Verify now"** to students not marked yet |
| 4:00 | **Person 5** | walks in facing phone 1, sits | **late** |
| 5:00 | **Person 2** | gets up, walks **out** past phone 2 (face visible to phone 2) | — |
| 5:40 | **Person 2** | walks back **in** facing phone 1, sits again | stays **present** |
| 6:00 | **Person 3** | gets up, walks **out** past phone 2, does **not** come back | 7:00: professor gets **"Count does not match"**; end: **absent** |
| 9:30 | — | stop both phones | — |

Rules: walk one at a time at normal speed, look at phone 1 when walking in (except Person 4), sit still,
nobody else walks through either picture.

### Short version: 5-minute class (same people, same phone places, about 4¾ min)
Film this as a **second pair of videos** (e.g. `C:\videos\door5.mp4` and `room5.mp4`). Timing is tight, so walk exactly on time.

| Video time | Who | Does | Result in the system |
|---|---|---|---|
| 0:00 | — | both phones recording; nobody in view | class starts |
| 0:10 | **Person 1** | walks in facing phone 1, sits | **present** |
| 0:20 | **Person 2** | walks in, sits | **present** |
| 0:30 | **Person 3** | walks in, sits | **present** |
| 0:40 | **Person 4** | walks in **looking down** (face hidden), sits | not marked |
| 1:00 | — | — | **"Verify now"** to students not marked (open for 2 min) |
| 1:30 | **Person 5** | walks in facing phone 1, sits | **late** |
| 1:50 | **Person 3** | walks **out** past phone 2, does **not** come back | 3:00: professor gets **"Count does not match"**; end: **absent** |
| 2:20 | **Person 2** | walks **out** past phone 2 | — |
| 2:40 | **Person 2** | walks back **in** facing phone 1, sits | stays **present** |
| 4:45 | — | stop both phones | — |

In the presentation press **5 min** instead of 10 min. Person 4 must finish "Verify now" before minute 3. Same final result as the 10-minute class.

### After filming
1. Copy both videos to the laptop: `C:\videos\door.mp4` (phone 1) and `C:\videos\room.mp4` (phone 2).
2. Tell Claude "videos ready". Claude checks one frame of each and sets the rotation and the exit line
   (`apps\edge\config.demo.yaml`). Do not start the demo before this.

---

## 2. Run the demo from the videos (the presentation)

1. Laptop: open PowerShell in `C:\dev\smart-attendence-system` and run
   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\run-video-demo.ps1 -Door C:\videos\door.mp4 -Room C:\videos\room.mp4
   ```
   It says "waiting for a live class". The live camera view opens at http://127.0.0.1:8090 (refresh it after ~10 s).
2. Website (https://attendiq-rho.vercel.app) as admin: **Admin → Demo → IOT401-01 → 10 min** (or **5 min** for the short videos), confirm.
   Both videos start within ~2 s.
3. On the screen: the live camera view (boxes + names) and **Live dashboard** of the class (from Admin → Demo → Running now).
4. About 2–3 min in, **Person 4's phone gets "Verify now"**. Person 4 opens it, does the face check and scans the
   room QR code (Admin → Demo → Running now → **Open class** shows it) → **present**. This part happens live, so the
   face API must be running on the laptop (`scripts\start-face-api.ps1`). Others who get the same message ignore it.
5. About 7 min in, the professor gets **"Count does not match"** (Person 3 left). Show it; do **not** press Start recheck.
6. The class ends by itself after 10 min; the laptop window stops. Expected:

| Person | Final |
|---|---|
| 1, 2 | present |
| 4 | present (self-verify); absent if they did not verify |
| 5 | late |
| 3 | absent (left and did not come back) |
| everyone else enrolled | absent |

If something goes wrong: take a photo of the PowerShell window and send it to Claude. Logs: `logs\video-demo-*.log`.

---

## 3. Run a live demo with the phones (no videos)

1. Phone 1: **IP Webcam** → Start server (`192.168.219.100:8080`). iPhone: **IP Camera Lite** → server on (`192.168.219.104:8081`), main camera.
2. Laptop:
   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\start-classroom.ps1 -MqttPort 1884 -FaceApiPort 8010
   ```
3. Website: **Admin → Demo → IOT401-01 →** 5 / 10 / 15 min (short clock) or **Full class** (normal rules).
4. Live camera view: http://127.0.0.1:8090.

Demo timing (minutes from the start):

| Rule | 5 min | 10 min | 15 min | Full |
|---|---|---|---|---|
| Present until | 1 | 2 | 3 | 10 |
| Late until | 4 | 8 | 12 | 30 |
| Room count check every | 1 | 2 | 3 | 5 |
| Professor alert at | 3 | 7 | 10 | end − 5 |

---

## 4. Everyday commands

| What | Command (in `C:\dev\smart-attendence-system`) |
|---|---|
| Website (production) | https://attendiq-rho.vercel.app — updates by itself after a push to GitHub |
| Website on the laptop | `cd apps\web; npm.cmd run dev` → http://localhost:3000 |
| Classroom stack (broker, face-api, ingest, edge) | `powershell -ExecutionPolicy Bypass -File scripts\start-classroom.ps1 -MqttPort 1884 -FaceApiPort 8010` |
| Face API + tunnel only | `powershell -ExecutionPolicy Bypass -File scripts\start-face-api.ps1` |
| Simulator class (30 fake students) | `cd apps\simulator; .\.venv\Scripts\python.exe -m simulator run` |
| Remove demo / test classes | `powershell -ExecutionPolicy Bypass -File scripts\reset-demo.ps1` (type `RESET`) |
| Milestone PDF again | `python scripts\make-milestone-pdf.py` → `docs\AttendIQ-Milestone-Report.pdf` |
| Web tests | `cd apps\web; npm.cmd run lint; npm.cmd run typecheck; npm.cmd test` |
| Edge tests | `cd apps\edge; .\.venv\Scripts\python.exe -m pytest -q` |

Port 8000 is used by another program (bowlersense), so the face API runs on **8010**; the project broker on **1884**.

---

## 5. Later
- After the presentation: delete the videos from `C:\videos` (they show faces).
- Rotate the Supabase secret key.
- Sync the Windows clock (Settings → Time → Sync now).

## Done
- 2026-11-23: Admin → Demo page (5 / 10 / 15 min / full class) and the video demo runner are live.
