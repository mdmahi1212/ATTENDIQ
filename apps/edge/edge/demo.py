"""One-click recorded demo: double-click demo\\START-DEMO.bat (= python -m edge.demo).

Put the two recordings in demo\\videos\\ as door*.mp4 (phone 1, outside the door) and room*.mp4 (phone 2, inside),
with the same ending for one pair: door.mp4 + room.mp4, door5.mp4 + room5.mp4 ... (.mov / .m4v / .avi / .mkv too).

It then, by itself: picks the class length from the video length (<= 6 min -> 5-minute class, <= 11 -> 10, else 15),
starts the face API (for "Verify now" on Person 4's phone) if it is not running, starts a real demo class on the
website, opens the live camera view and the class's live dashboard, and plays both recordings as the door and room
cameras until the class ends. Camera settings: apps\\edge\\config.demo.yaml when it exists, else config.yaml.
"""

from __future__ import annotations

import argparse
import os
import socket
import subprocess
import sys
import threading
import time
import webbrowser
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import TextIO

EDGE_DIR = Path(__file__).resolve().parent.parent
REPO = EDGE_DIR.parent.parent
VIDEOS = REPO / "demo" / "videos"
LOGS = REPO / "demo" / "logs"
VIDEO_EXT = (".mp4", ".mov", ".m4v", ".avi", ".mkv")
FACE_API_PORT = 8010  # port 8000 is taken by another program on this laptop


@dataclass(frozen=True)
class Pair:
    name: str  # the shared ending ("" for door.mp4 + room.mp4)
    door: Path
    room: Path


def find_pairs(folder: Path) -> list[Pair]:
    """door<X>.<ext> + room<X>.<ext> with the same <X>, sorted by <X>. Case-insensitive."""
    if not folder.is_dir():
        return []
    doors: dict[str, Path] = {}
    rooms: dict[str, Path] = {}
    for p in folder.iterdir():
        stem, ext = p.stem.lower(), p.suffix.lower()
        if not p.is_file() or ext not in VIDEO_EXT:
            continue
        if stem.startswith("door"):
            doors.setdefault(stem[4:].strip(" _-"), p)
        elif stem.startswith("room"):
            rooms.setdefault(stem[4:].strip(" _-"), p)
    return [Pair(k, doors[k], rooms[k]) for k in sorted(doors.keys() & rooms.keys())]


def class_minutes(video_seconds: float) -> int:
    """Shortest demo class that covers the recording (5 / 10 / 15 minutes)."""
    m = video_seconds / 60
    return 5 if m <= 6 else 10 if m <= 11 else 15


def video_seconds(path: Path) -> float:
    import cv2

    cap = cv2.VideoCapture(str(path))
    try:
        fps = cap.get(cv2.CAP_PROP_FPS) or 0.0
        frames = cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0.0
        return frames / fps if fps > 0 else 0.0
    finally:
        cap.release()


def frame_at(path: Path, seconds: float):  # noqa: ANN201 - numpy image or None
    import cv2

    cap = cv2.VideoCapture(str(path))
    try:
        cap.set(cv2.CAP_PROP_POS_MSEC, seconds * 1000)
        ok, frame = cap.read()
        return frame if ok else None
    finally:
        cap.release()


def setup_cameras(pair: Pair, api, cfg, site: str) -> int:  # noqa: ANN001
    """Sends one picture from each recording to the website, then opens the camera pages to draw on."""
    from edge.camera import rotate_frame

    for kind, path, rot in (("gate", pair.door, cfg.gate.rotate), ("inside", pair.room, cfg.inside.rotate)):
        secs = video_seconds(path)
        frame = frame_at(path, min(60.0, secs / 3))  # a moment when people are in view
        if frame is None:
            return fail(f"Could not read a picture from {path.name}.")
        import cv2

        frame = rotate_frame(frame, rot)
        h, w = frame.shape[:2]
        if w > 1280:
            frame = cv2.resize(frame, (1280, int(h * 1280 / w)))
        api.upload_snapshot(kind, cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 85])[1].tobytes())
        print(f"  picture from {path.name} sent ({'door' if kind == 'gate' else 'room'} camera)")
    print("\nNow on the website: Operator -> Devices -> edge-B204 -> the room camera: draw the seat area, the exit line"
          "\nand click the door side, then Save. Then double-click START-DEMO.bat.")
    webbrowser.open(f"{site}/operator")
    return 0


def port_open(port: int, host: str = "127.0.0.1") -> bool:
    with socket.socket() as s:
        s.settimeout(0.5)
        return s.connect_ex((host, port)) == 0


class Tee:
    """Writes to the console and to the log file."""

    def __init__(self, *streams: TextIO) -> None:
        self.streams = streams

    def write(self, s: str) -> int:
        for st in self.streams:
            st.write(s)
            st.flush()
        return len(s)

    def flush(self) -> None:
        for st in self.streams:
            st.flush()


def choose(pairs: list[Pair]) -> Pair:
    if len(pairs) == 1:
        return pairs[0]
    print("Several recordings found:")
    for i, p in enumerate(pairs, 1):
        print(f"  {i}. {p.door.name} + {p.room.name}  ({video_seconds(p.door) / 60:.1f} min)")
    while True:
        a = input(f"Which one? 1-{len(pairs)}: ").strip()
        if a.isdigit() and 1 <= int(a) <= len(pairs):
            return pairs[int(a) - 1]


def fail(msg: str) -> int:
    print(f"\n{msg}")
    return 2


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="edge.demo", description="One-click recorded-video demo class.")
    ap.add_argument("--section", default="IOT401-01", help="section the demo class is for (default IOT401-01)")
    ap.add_argument("--folder", default=str(VIDEOS), help="folder with the recordings (default demo\\videos)")
    ap.add_argument("--no-face-api", action="store_true", help="do not start the face API")
    ap.add_argument("--no-browser", action="store_true", help="do not open the browser")
    ap.add_argument("--setup", action="store_true", help="only send a picture from each video to draw the geometry on")
    a = ap.parse_args(argv)

    pairs = find_pairs(Path(a.folder))
    if not pairs:
        return fail(f"No recordings in {a.folder}.\nPut them there as door.mp4 (phone 1, outside the door) and "
                    "room.mp4 (phone 2, inside the room), then double-click START-DEMO.bat again.")
    if not (EDGE_DIR / ".env").exists():
        return fail(f"{EDGE_DIR / '.env'} is missing (device key + website address). See apps\\edge\\.env.example.")
    pair = choose(pairs)
    if a.setup:
        from attendiq_common.api import EdgeApi
        from edge.config import Env, load_yaml

        env = Env()  # type: ignore[call-arg]
        return setup_cameras(pair, EdgeApi(env.api_base_url, env.edge_device_key), load_yaml(env.edge_config_path),
                             env.api_base_url.rstrip("/"))
    secs = video_seconds(pair.door)
    minutes = class_minutes(secs)

    demo_cfg = EDGE_DIR / "config.demo.yaml"
    if demo_cfg.exists():
        os.environ["EDGE_CONFIG_PATH"] = str(demo_cfg)  # environment beats .env
    LOGS.mkdir(parents=True, exist_ok=True)
    log_path = LOGS / f"demo-{datetime.now():%Y%m%d-%H%M%S}.txt"
    log_file = log_path.open("w", encoding="utf-8")
    sys.stdout = Tee(sys.__stdout__, log_file)  # type: ignore[assignment]
    sys.stderr = Tee(sys.__stderr__, log_file)  # type: ignore[assignment]
    try:
        print(f"AttendIQ demo\n  door video : {pair.door.name}\n  room video : {pair.room.name}\n"
              f"  length     : {secs / 60:.1f} min -> {minutes}-minute class for {a.section}\n"
              f"  settings   : {demo_cfg.name if demo_cfg.exists() else 'config.yaml'}\n  log        : {log_path}\n")

        if not a.no_face_api and not port_open(FACE_API_PORT):
            print(f"Starting the face API (port {FACE_API_PORT}) in its own window ...")
            subprocess.Popen(  # noqa: S603 - our own script, fixed arguments
                ["powershell", "-ExecutionPolicy", "Bypass", "-File", str(REPO / "scripts" / "start-face-api.ps1"),
                 "-Port", str(FACE_API_PORT)],
                cwd=str(REPO), creationflags=getattr(subprocess, "CREATE_NEW_CONSOLE", 0))

        from attendiq_common.api import EdgeApi, EdgeApiError
        from edge.config import Env, load_yaml

        env = Env()  # type: ignore[call-arg]
        cfg = load_yaml(env.edge_config_path)
        api = EdgeApi(env.api_base_url, env.edge_device_key)
        try:
            started = api.demo_class(a.section, minutes)
        except EdgeApiError as e:
            if e.status == 409:
                return fail("A class is already running in this room. End it on the website (or wait), then start again.")
            return fail(f"Could not start the class on the website: {e}")
        session_id = started["session_id"]
        print(f"Class started on the website: {minutes} min, session {session_id[:8]}")

        if not a.no_browser:
            urls = [f"http://{cfg.liveview.host}:{cfg.liveview.port}",
                    f"{env.api_base_url.rstrip('/')}/sessions/{session_id}/dashboard"]
            threading.Thread(target=lambda: (time.sleep(6), [webbrowser.open(u) for u in urls]), daemon=True).start()

        from edge.__main__ import main as edge_main

        return edge_main(["--direct", "--demo", "--video", str(pair.door), "--room-video", str(pair.room)])
    finally:
        print(f"\nLog saved: {log_path}")
        sys.stdout, sys.stderr = sys.__stdout__, sys.__stderr__
        log_file.close()


if __name__ == "__main__":
    raise SystemExit(main())
