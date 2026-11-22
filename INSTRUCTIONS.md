# What I have to do

## Now
1. Merge https://github.com/mdmahi1212/ATTENDIQ/pull/2 (green button → Confirm merge).
2. On the laptop, in the project folder: `git checkout main` then `git pull`.
3. Do the demo below.

---

## The demo: 5 friends, 2 phones, about 9 minutes

**You** set up the phones and call out the times. You are not in the video.

### Before filming
- All 5 friends: have an account, are enrolled in **IOT401-01**, and their face is **active** (check Admin → Faces).
- **Person 4** has the AttendIQ app on their phone with notifications on, and comes to the presentation.

### Who does what

| Time | Person | Does | Result |
|---|---|---|---|
| 0:10 | Person 1 | walks in, sits | present |
| 0:20 | Person 2 | walks in, sits | present |
| 0:30 | Person 3 | walks in, sits | present |
| 0:40 | Person 4 | walks in **looking down** (face not seen), sits | not marked yet |
| 3:00 | Person 5 | walks in, sits | late |
| 4:00 | Person 2 | walks out | — |
| 4:45 | Person 2 | walks back in, sits | still present |
| 6:00 | Person 3 | walks out, does **not** come back | absent at the end |
| 9:00 | — | you stop both phones | — |

Rules while filming: walk at normal speed, face the camera when walking in (except Person 4), sit where phone 2 sees you, and sit still.

### Filming (you)
1. Phone 1: **outside** the door, head height, facing the people coming in. Landscape.
2. Phone 2: **inside** the room, seeing the seats and the door. Landscape.
3. Press record on **both** phones, start a stopwatch, call out the times from the table.
4. At 9:00 stop both phones.

### On the laptop (you)
1. Copy phone 1's video into the project's `demo` folder and rename it **`door.mp4`**.
2. Copy phone 2's video into the same folder and rename it **`room.mp4`**.
3. Double-click **`demo\START-DEMO.bat`**.

### During the presentation
- On the screen: the browser window that opens (cameras + LED) and the professor's live page on the website.
- Around minute 2–3 **Person 4's phone gets "Verify now"**: Person 4 opens it, does the face check and scans the QR code shown on the professor's page → present.
- Around minute 8 the professor gets **"Count does not match"** (Person 3 left). Just show it; do **not** press Start recheck.
- At minute 10 the class ends by itself. The black window shows the result:

| Person | Final |
|---|---|
| 1, 2, 4 | present |
| 5 | late |
| 3 | absent (left and did not come back) |

If something goes wrong: take a photo of the black window and send it to Claude.

---

## After the demo
1. Vercel → project **attendiq** → Settings → Environment Variables → `EDGE_REPLAY_SESSIONS` = `false` → Save → Redeploy.
2. Optional: remove the demo classes: `powershell -ExecutionPolicy Bypass -File scripts\reset-demo.ps1`, type `RESET`.
3. Optional: delete the videos from the `demo` folder (they show your friends' faces).

## Later
- Rotate the Supabase secret key.
- Sync the Windows clock.

## Done
- 2026-11-22: PR #1 merged, demo switch on in Vercel.
