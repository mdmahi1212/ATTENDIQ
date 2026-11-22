# Live demo (about 10 minutes)

Matches the 10 steps of `docs/ARCHITECTURE.md` ("Live demo script"). People: **A**, **B**, **C** = real students with
enrolled faces and push enabled on their phones; **Prof** = `professor@attendance.test` (teaches IOT401-01 and AIE302-01);
**Admin** = an admin account with a password (the seeded `admin@attendance.test` has none until one is set).

## Before the audience arrives (10 min)

1. Laptop on the classroom Wi-Fi. Sync the clock: Settings → Time → **Sync now**.
2. `powershell -ExecutionPolicy Bypass -File scripts\reset-demo.ps1` (type `RESET`) — removes old test/simulation sessions.
3. Phone #1: IP Webcam → **Start server**, portrait, pointing at the door at head height. Put its address in
   `apps/edge/.env` (`GATE_CAMERA_SOURCE=http://<phone-ip>:8080/video`).
   Optional ESP32 LED: once, create a device of kind `esp32` in Operator → Devices, run
   `scripts\new-device-key.ps1 -DeviceId <its id> -MqttUser esp32-B204`, put the printed MQTT password in the board's
   `secrets.h`, restart Mosquitto; when powered the LED blinks twice. Without it, step 4 shows only the dashboard.
4. `powershell -ExecutionPolicy Bypass -File scripts\start-classroom.ps1 -MqttPort 1884` (or `1883` if the
   Mosquitto Windows service is stopped). Wait for the **edge** window: `detector ready … mode presence; rotate 90`.
5. Laptop browser: sign in as Prof. Second browser window (projector): the room QR page is opened from the live page later.
6. Phones A/B/C: open the app once (signed in), notifications allowed.

## The 10 steps

| # | Do | Expected (what to point at) |
|---|---|---|
| 1 | Admin → Courses / Sections / Enrollments: show the section with 3 real + 30 SIM students and the professor (create a new course + section live if time allows) | rows appear; enrolling a student without a face sends the `enroll_face` push |
| 2 | A shows the enrollment on the phone (or enrolls a new account): consent → 3 random liveness actions → 10 photos | face status **active**; a duplicate face on another account would go to **review** |
| 3 | Admin → Demo → IOT401-01 → **Full class** (or 5 / 10 / 15 min) (timetabled classes start automatically at T0−10). Open the session from the admin dashboard / professor home. Then `cd apps\simulator; .\.venv\Scripts\python.exe -m simulator run` (MQTT) for the 30 SIM students | live page: counters move, roster turns green/amber without reloading |
| 4 | A walks toward phone #1 | edge window `GATE_ENTRY_RECOGNISED`; **LED green**; A's row → **present · door camera** within ~1 s |
| 5 | B walks in hiding the face and sits in view of the laptop webcam (inside camera). The count subtracts 1 staff member, so the webcam must see **Prof + B** (demo classes from Admin → Demo already count no staff; one-person demo). The first count check runs at **T0+10** — start the session 10 min before this step, or use the *started 12 min ago* button | **Counted > Verified** banner once the count is stable (60 s); at the next minute tick B gets **"verify now"**; Prof clicks **Show room QR**; B scans it, does the face check → **present · self-verify** (first mismatch window) |
| 6 | For the late case: **End session** first (only one live session per room — both demo sections use B204), then Admin → Demo → **10 min**, wait past minute 2; C walks past phone #1 | C → **late** |
| 7 | Someone holds a printed photo of A on the self-verify screen | **Not verified** — browser challenge fails, or the server anti-spoof check: "looked like a picture or a screen" |
| 8 | A walks out past the **inside camera** (beside the door, looking into the room) and does not come back | at **T_end−5** the professor gets *Count does not match* (no student is notified); at the end A → **absent** (`left_no_return`). Optional: the professor presses **Start recheck** → anyone who does not answer → **left early** (`recheck failed`) |
| 9 | Unplug the laptop's Wi-Fi (or internet) for 1 minute during the simulation, plug it back | ingest logs `post failed … retry`; after reconnect every event arrives with its **original time** (no gaps on the live page) |
| 10 | **End session** on the live page → student A opens **My attendance** → **Appeal** (reason + photo) → Prof → **Appeals** → Approve with a note → Admin → **Audit log** | record changes to the requested status; audit row shows the professor and the reason; the student gets an "Appeal approved" push |

## If something goes wrong

See the troubleshooting section in `PROGRESS.md` (camera offline, wrong rotation, tunnel URL, push on iOS, clock).
