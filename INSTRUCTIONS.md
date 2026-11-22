# INSTRUCTIONS — everything you have to do, in one place

Kept up to date after every change. Short steps only. Setting up a brand-new laptop: `README.md` (Quick start).
Accounts and passwords are NOT written here (this repo is public): use the ones you already have.

---

## 1. Tomorrow: film the demo videos (2 people, 2 phones, about 9½ min)

### Before filming
- **Mahi** and **Fahim** have an account, are enrolled in **IOT401-01**, and their face shows **active** (Admin → Face enrollment). ✅ both are ready now.
- Both phones charged, with **at least 2 GB free**. Set the phone camera to **1080p, 30 fps** (not 4K, not 60 fps).
- A third person (or a stand / tripod) holds each phone **still** for the whole video.

### Where the phones go
| Phone | Where | Points at | Hold it |
|---|---|---|---|
| **Phone 1** (door video) | **outside** the door, at head height, 1.5–2 m from the door | the faces of people walking **in** | **landscape**, still |
| **Phone 2** (room video) | **inside** the room, beside the door | the seats **and** the door, so it sees people sitting and people walking out | **landscape**, still |

Good light on faces. No window behind the people (backlight hides faces).

### What happens (start both phones at the same moment: count "3-2-1-record")
| Video time | Who | Does | Result in the system |
|---|---|---|---|
| 0:00 | — | both phones start recording; nobody in view | class starts |
| 0:30 | **Mahi** | walks in **facing phone 1**, slowly, sits where phone 2 can see | **present** |
| 3:00 | **Fahim** | walks in facing phone 1, sits | **late** |
| 5:00 | **Mahi** | gets up, walks **out** past phone 2 (face visible to phone 2) | — |
| 5:40 | **Mahi** | walks back **in** facing phone 1, sits again | stays **present** |
| 6:30 | **Fahim** | gets up, walks **out** past phone 2, does **not** come back | at 7:00 the professor gets **"Count does not match"**; at the end **absent** |
| 9:30 | — | stop both phones | — |

Rules: walk at normal speed, look at the phone when walking in, sit still, nobody else walks through.

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
2. Website (https://attendiq-rho.vercel.app) as admin: **Admin → Demo → IOT401-01 → 10 min**, confirm.
   Both videos start within ~2 s.
3. On the screen: the live camera view (boxes + names) and **Live dashboard** of the class (from Admin → Demo → Running now).
4. The class ends by itself after 10 min; the laptop window stops. Expected: Mahi **present**, Fahim **absent**
   (left and did not come back), every other enrolled student **absent**.

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
