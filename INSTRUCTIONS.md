# INSTRUCTIONS: everything you have to do

One list of every step that needs **you** (your phones, your laptop, your accounts, a click on GitHub or
Vercel). Claude keeps this file up to date in every session: new steps are added under **Do now** or
**Later**, finished ones move to **Done**.

Last updated: 2026-11-22

---

## Do now (in this order)

- [ ] **1. Merge pull request #2 (one-click demo).**
      Open https://github.com/mdmahi1212/ATTENDIQ/pull/2 → **Merge pull request** → **Confirm merge**.
      It only changes the laptop side, so there is no website redeploy to wait for.
- [ ] **2. Get the new code on the laptop.** In PowerShell, in the project folder:
      ```powershell
      git checkout main
      git pull
      ```
- [ ] **3. Quick test with just you (about 3 minutes of video).**
      1. Record with **both phones at the same time**, landscape. Phone 1 stands **outside** the door, phone 2
         **inside** the room. Start both recordings within a few seconds of each other.
      2. In the video: walk in at 0:20 → sit in phone 2's view for 1 minute → walk out at 1:30 → walk back in at 2:30 → stop both phones at 3:00.
      3. Copy the videos to the `demo` folder at the top of the project: `demo\door.mp4` (phone 1) and
         `demo\room.mp4` (phone 2). `.mov` works too.
      4. Double-click `demo\run-quick-test.bat`. The live view opens in the browser.
      5. Check: green LED when you walk in, nothing while you sit, amber LED when you walk out, green again
         when you come back, and at the end the window prints you as **present**.
      6. If something is wrong, see **Fixing the demo** below, or send Claude the text from the window (also
         saved in `demo\logs\`).
- [ ] **4. Full demo class with friends (about 9 minutes of video).**
      1. Every friend who should be recognised: account, enrolled in **IOT401-01**, face **active**
         (enroll on the student app; approve in Admin → Faces if it went to review).
      2. One friend plays the professor and stays in phone 2's view. If nobody does, set `staff: 0` in
         `demo\settings.yaml`.
      3. Film the script in `docs\SCENARIO_VIDEO.md` (section "Full demo class").
      4. Put the videos in `demo\` as above and double-click `demo\run-full-demo.bat`.
      5. Show on the screen: the live view (opens by itself) and the professor's live page on the website.
         X verifies on their own phone when the "verify now" push arrives (scan the QR on the professor's page).
      6. Do **not** press Start recheck after the professor alert in this demo (the friends on video cannot
         answer and would become "left early").
- [ ] **5. After the presentation: switch the demo off.** Vercel → project **attendiq** → Settings →
      Environment Variables → set `EDGE_REPLAY_SESSIONS` to `false` → Deployments → newest → **⋯** → Redeploy.

## Fixing the demo

| You see | Do this |
|---|---|
| A video looks sideways in the live view | `demo\settings.yaml`: `door_rotate: 90` (phone 1) or `room_rotate: 90` (phone 2); try 270 if still wrong |
| Amber LED while someone is just sitting | move the exit line closer to the door: `exit_line` in `demo\settings.yaml` (amber line in the live view) |
| No amber LED when someone walks out | the exit line is not between the seats and the door, or `door_side` is wrong (left / right) |
| "Put the videos in ..." | the files must be named `door` and `room` (`.mp4` / `.mov`) and sit directly in `demo\` |
| "could not start the class" ... 403 | `EDGE_REPLAY_SESSIONS` is not `true` in Vercel, or not redeployed after setting it |
| "another live session is running" | end the other class in room B204 on the website first |
| Nobody recognised | the friend's face is not **active**, or the video is too dark / faces too small; film closer |

## Later (open, not urgent)

- [ ] **Rotate the Supabase secret key.** It was once pasted into a chat. Supabase → Project Settings →
      API Keys → new secret key → put it in `apps\web\.env.local` with
      `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\set-service-key.ps1` → then
      `cd apps\web; node scripts/push-vercel-env.mjs` → redeploy on Vercel.
- [ ] **Sync the Windows clock** (it was about 2.5 min slow): Settings → Time & language → Date & time →
      "Set time automatically" on → **Sync now**.
- [ ] **Free MQTT port 1883** once, in an **admin** PowerShell:
      `Stop-Service mosquitto; Set-Service mosquitto -StartupType Manual`
      (or always start with `scripts\start-classroom.ps1 -MqttPort 1884`).
- [ ] **Database test setup:** copy `.env.example` → `.env` at the project root, fill `SUPABASE_PROJECT_REF`,
      `SUPABASE_DB_PASSWORD`, `SUPABASE_DB_URL` (Supabase → Connect → Session pooler), then run
      `scripts\test-db.ps1 -Replay` once.
- [ ] **Delete the old test student** `student1@attendence.test` (its face photos are yours): Admin → Faces →
      try Approve / Reject, then ask Claude to delete it.
- [ ] **Student sign-up emails:** Supabase only mails project members. For other students either turn off
      "Confirm email" (Supabase → Auth → Providers → Email) or set up SMTP.
- [ ] **Two-factor for admins:** set up an authenticator for your admin account on `/account/security`, then
      decide when to set `ENFORCE_MFA=true` in Vercel.
- [ ] **Remaining live demo checks (Gate 8):** count mismatch → self-verify with a real person (the full demo
      class covers it), printed-photo attack test, ESP32 LED (needs a board), and the README quick start on a
      second, clean laptop.

## Ideas Claude offered (only if you want them)

- Detect people leaving with a **hidden face** (count bodies crossing the exit line, alert the professor).
- Better tracking when **many people walk in together** (use the face to keep tracks apart) + a group scene in the demo script.
- A **random surprise recheck** during class.
- A copy of the **system map** page in `docs\`, or slides for the presentation
  (map: https://claude.ai/artifact/M5vTKpXpSxYjZLsVftHN5q).

## Done

- [x] 2026-11-22: merged pull request #1 (recorded-video demo, presentation mode, full demo class, virtual LED).
- [x] 2026-11-22: set `EDGE_REPLAY_SESSIONS=true` in Vercel and redeployed (checked: demo route is live).
- [x] 2026-11-22: live tests with your phones: gate walk-in → present, late, recheck → verified, ignored
      recheck → left early, appeal approved, exit camera → left and never came back → absent, Wi-Fi unplugged 1 minute → nothing lost.
- [x] 2026-11-18 – 11-22: installed Git, Mosquitto, cloudflared; service key in `apps\web\.env.local`;
      Vercel + GitHub connected; edge on the NVIDIA GPU.

## Commands you use often

| What | Command (PowerShell, project folder) |
|---|---|
| Get the latest code | `git checkout main; git pull` |
| Start everything for a live class | `powershell -ExecutionPolicy Bypass -File scripts\start-classroom.ps1 -MqttPort 1884` |
| Face API + tunnel only (students enrolling) | `powershell -ExecutionPolicy Bypass -File scripts\start-face-api.ps1` |
| Demo with videos | put `door.mp4` + `room.mp4` in `demo\`, double-click `demo\run-quick-test.bat` or `demo\run-full-demo.bat` |
| Clear old demo classes | `powershell -ExecutionPolicy Bypass -File scripts\reset-demo.ps1` |
| Send your work to GitHub | `git add -A; git commit -m "what you changed"; git push` |
