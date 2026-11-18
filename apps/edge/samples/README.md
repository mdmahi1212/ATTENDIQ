# Gate camera recordings (not committed: faces)

Put `walk.mp4` here (gitignored). How to record it with phone #1:

1. Mount the phone where the gate camera will be: about head height (1.6-1.8 m), 2-3 m inside the room,
   looking at the door, landscape, so a person walking IN moves toward the camera.
2. Record 15-30 s with the normal camera app: empty doorway 3 s, then walk in at normal speed, face visible,
   then out of the frame. Optionally a second walk-in by someone NOT enrolled (should become "unknown").
3. Copy it to `apps/edge/samples/walk.mp4`.
4. Replay it (a live session must exist in B204: Admin -> Sections -> "Start 30-min test session"):
   `cd apps/edge; .\.venv\Scripts\python.exe -m edge --video samples\walk.mp4 --direct --presence`
   (`--direct` posts to the web API without a broker; drop `--presence` once the entry line is set in config.yaml).
