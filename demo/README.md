# Recorded-video demo

1. Record with your two phones (landscape):
   - **phone 1** outside the door, facing people coming in
   - **phone 2** inside the room, seeing the seats and the door
2. Copy the videos into this folder and name them:
   - `door.mp4` (phone 1)
   - `room.mp4` (phone 2)

   `.mov` from an iPhone works too (`door.mov`, `room.mov`).
3. Double-click:
   - `run-quick-test.bat`: a test with just you; the class ends when the videos end
   - `run-full-demo.bat`: the full 10-minute demo class (present 2 min, late 5 min, count check and "verify now" push, professor alert, ends by itself)

The live view opens in the browser (cameras + door LED). Open the professor's live page on the website next to it.
When the class is over, the final table is printed, and the log is saved in `logs\`.

First run: `settings.yaml` is created here. Change it if a video looks sideways, or to move the exit line
(it is shown in amber on phone 2's picture in the live view). The filming script is in `docs/SCENARIO_VIDEO.md`.

Needs (already set up for the live classes): `apps\edge\.venv`, `apps\edge\.env` (device key), and
`EDGE_REPLAY_SESSIONS=true` in Vercel.
