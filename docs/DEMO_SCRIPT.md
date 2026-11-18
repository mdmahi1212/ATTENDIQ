# Live demo (about 10 minutes)

Matches the 10 steps of `docs/ARCHITECTURE.md` ("Live demo script"). People: **A**, **B**, **C** = real students with
enrolled faces and push enabled on their phones; **Prof** = `professor@attendance.test` (teaches IOT401-01 and AIE302-01).

## Before the audience arrives (10 min)

1. Laptop on the classroom Wi-Fi. Sync the clock: Settings → Time → **Sync now**.
2. `powershell -ExecutionPolicy Bypass -File scripts\reset-demo.ps1` (type `RESET`) — removes old test/simulation sessions.
3. Phone #1: IP Webcam → **Start server**, portrait, pointing at the door at head height. Put its address in
   `apps/edge/.env` (`GATE_CAMERA_SOURCE=http://<phone-ip>:8080/video`). ESP32 powered (LED blinks twice when connected).
4. `powershell -ExecutionPolicy Bypass -File scripts\start-classroom.ps1 -MqttPort 1884` (or `1883` if the
   Mosquitto Windows service is stopped). Wait for the **edge** window: `detector ready … mode presence; rotate 90`.
5. Laptop browser: sign in as Prof. Second browser window (projector): the room QR page is opened from the live page later.
6. Phones A/B/C: open the app once (signed in), notifications allowed.

## The 10 steps

| # | Do | Expected (what to point at) |
|---|---|---|
| 1 | Admin → Courses / Sections / Enrollments: show the section with 3 real + 30 SIM students and the professor (create a new course + section live if time allows) | rows appear; enrolling a student without a face sends the `enroll_face` push |
| 2 | A shows the enrollment on the phone (or enrolls a new account): consent → 3 random liveness actions → 10 photos | face status **active**; a duplicate face on another account would go to **review** |
| 3 | Admin → Sections → **Start 30-min test session** for IOT401-01 (timetabled classes start automatically at T0−10). Open the session from the admin dashboard / professor home. Then `cd apps\simulator; .\.venv\Scripts\python.exe -m simulator run` (MQTT) for the 30 SIM students | live page: counters move, roster turns green/amber without reloading |
| 4 | A walks toward phone #1 | edge window `GATE_ENTRY_RECOGNISED`; **LED green**; A's row → **present · door camera** within ~1 s |
| 5 | B walks in hiding the face, sits in view of the laptop webcam | **Counted > Verified** banner; after the next minute tick (first check at T0+10) B gets **"verify now"**; Prof clicks **Show room QR**; B scans it, does the face check → **present · self-verify** |
| 6 | For the late case: Admin → Sections → **Demo: class started 12 min ago** (a second section, e.g. AIE302-01, or after ending the first session); C walks past phone #1 | C → **late** |
| 7 | Someone holds a printed photo of A on the self-verify screen | **Not verified** — browser challenge fails, or the server anti-spoof check: "looked like a picture or a screen" |
| 8 | A walks out (or the professor shows the OUT marker) → **Start recheck** on the live page; A does not answer | A → **left early** (`recheck failed`) when the window closes; the DB also opens a recheck by itself at T_end−10 if the count is lower than verified |
| 9 | Unplug the laptop's Wi-Fi (or internet) for 1 minute during the simulation, plug it back | ingest logs `post failed … retry`; after reconnect every event arrives with its **original time** (no gaps on the live page) |
| 10 | **End session** on the live page → student A opens **My attendance** → **Appeal** (reason + photo) → Prof → **Appeals** → Approve with a note → Admin → **Audit log** | record changes to the requested status; audit row shows the professor and the reason; the student gets an "Appeal approved" push |

## If something goes wrong

See the troubleshooting section in `PROGRESS.md` (camera offline, wrong rotation, tunnel URL, push on iOS, clock).
