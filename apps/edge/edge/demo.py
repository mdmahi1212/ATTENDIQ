"""One-click recorded-video demo: python -m edge.demo [--full]

Put the two recordings in the repo's demo/ folder:
  demo/door.mp4  phone 1, outside the door (people coming in)
  demo/room.mp4  phone 2, inside the room (the seats and the way out)
(.mov / .m4v / .avi / .mkv work too.) Then double-click demo/START-DEMO.bat.

This builds a demo camera config from your config.yaml + demo/settings.yaml (your config.yaml is not changed),
opens the live view, starts a real class with the videos, and saves the log + final table in demo/logs/.
"""

from __future__ import annotations

import argparse
import os
import sys
import threading
import time
import webbrowser
from datetime import datetime
from pathlib import Path
from typing import Any, TextIO

import yaml

EDGE_DIR = Path(__file__).resolve().parent.parent
REPO = EDGE_DIR.parent.parent
DEMO_DIR = REPO / "demo"
VIDEO_EXT = (".mp4", ".mov", ".m4v", ".avi", ".mkv")

DEFAULT_SETTINGS: dict[str, Any] = {
    "section": "IOT401-01",
    "staff": 1,  # people in phone 2's view who are not students (the professor); 0 if nobody plays the professor
    "door_rotate": 0,  # clockwise degrees if phone 1's video looks sideways in the live view (90 / 180 / 270)
    "room_rotate": 0,
    # Exit line in phone 2's picture (0..1 from the left / top), drawn in amber in the live view.
    # It must lie between the seats and the door: people going out cross it, nobody seated does.
    "exit_line": [[0.25, 0.0], [0.25, 1.0]],
    "door_side": "left",  # where the door is in phone 2's picture: left / right (top / bottom for a horizontal line)
    "seat_area": [[0.0, 0.3], [1.0, 0.3], [1.0, 1.0], [0.0, 1.0]],  # where people sit in phone 2's picture
    "door_offset": 0.0,  # seconds to skip at the start of door video (if phone 1 started recording earlier)
    "room_offset": 0.0,
}


def find_video(folder: Path, name: str) -> Path | None:
    """demo/door.mp4, demo/Door.MOV ... (first match by extension order)."""
    if not folder.is_dir():
        return None
    files = {p.name.lower(): p for p in folder.iterdir() if p.is_file()}
    for ext in VIDEO_EXT:
        if f"{name}{ext}" in files:
            return files[f"{name}{ext}"]
    return None


def load_settings(folder: Path) -> dict[str, Any]:
    """demo/settings.yaml merged over the defaults (created with the defaults on the first run)."""
    path = folder / "settings.yaml"
    if not path.exists():
        example = folder / "settings.example.yaml"
        path.write_text(example.read_text(encoding="utf-8") if example.exists() else yaml.safe_dump(DEFAULT_SETTINGS),
                        encoding="utf-8")
    data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    return {**DEFAULT_SETTINGS, **{k: v for k, v in data.items() if v is not None}}


def deep_merge(base: dict[str, Any], over: dict[str, Any]) -> dict[str, Any]:
    out = dict(base)
    for k, v in over.items():
        out[k] = deep_merge(out[k], v) if isinstance(v, dict) and isinstance(out.get(k), dict) else v
    return out


def out_side(door_side: str) -> int:
    """GateConfig convention: +1 = LEFT of a top-to-bottom line / BELOW a left-to-right line is OUT."""
    side = str(door_side).strip().lower()
    if side in ("left", "bottom", "below"):
        return 1
    if side in ("right", "top", "above"):
        return -1
    raise ValueError(f"door_side must be left / right / top / bottom, not {door_side!r}")


def demo_config(base: dict[str, Any], s: dict[str, Any]) -> dict[str, Any]:
    """Camera settings for two recordings: phone 1 = way in (presence), phone 2 = room count + exit line."""
    (ax, ay), (bx, by) = s["exit_line"]
    return deep_merge(base, {
        "gate": {"rotate": int(s["door_rotate"]), "entry_mode": "presence"},
        "inside": {"enabled": True, "rotate": int(s["room_rotate"]), "roi": s["seat_area"]},
        "exit": {"enabled": True, "mode": "line", "line_a": [ax, ay], "line_b": [bx, by], "out_side": out_side(s["door_side"])},
        "liveview": {"enabled": True},
    })


def edge_args(door: Path, room: Path, s: dict[str, Any], full: bool) -> list[str]:
    args = ["--direct", "--start-session", "--section", str(s["section"]), "--staff", str(int(s["staff"])),
            "--video", str(door), "--exit-video", str(room)]
    if float(s["door_offset"]):
        args += ["--video-offset", str(float(s["door_offset"]))]
    if float(s["room_offset"]):
        args += ["--exit-offset", str(float(s["room_offset"]))]
    if full:
        args.append("--full-class")
    return args


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


def _open_later(urls: list[str], delay: float) -> None:
    def run() -> None:
        time.sleep(delay)
        for u in urls:
            webbrowser.open(u)
    threading.Thread(target=run, daemon=True).start()


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="edge.demo", description="Run the recorded-video demo class.")
    ap.add_argument("--full", action="store_true", help="full 10-minute demo class (demo timing, ends by itself)")
    ap.add_argument("--folder", default=str(DEMO_DIR), help="folder with door.mp4 + room.mp4 (default: <repo>/demo)")
    ap.add_argument("--no-browser", action="store_true", help="do not open the live view in the browser")
    a = ap.parse_args(argv)
    folder = Path(a.folder).resolve()

    door, room = find_video(folder, "door"), find_video(folder, "room")
    missing = [n for n, v in (("door", door), ("room", room)) if v is None]
    if missing:
        print(f"\nPut the videos in {folder}:\n  door.mp4  = phone 1 (outside the door)\n"
              f"  room.mp4  = phone 2 (inside the room)\nMissing: {', '.join(missing)} (.mp4 / .mov / .m4v / .avi / .mkv)")
        return 2
    if not (EDGE_DIR / ".env").exists():
        print(f"\n{EDGE_DIR / '.env'} is missing: the edge needs its device key and API address (see .env.example).")
        return 2
    assert door and room

    settings = load_settings(folder)
    cfg_src = EDGE_DIR / "config.yaml"
    base = yaml.safe_load((cfg_src if cfg_src.exists() else EDGE_DIR / "config.example.yaml").read_text(encoding="utf-8")) or {}
    cfg_path = EDGE_DIR / "data" / "config.demo.yaml"
    cfg_path.parent.mkdir(parents=True, exist_ok=True)
    cfg = demo_config(base, settings)
    cfg_path.write_text(yaml.safe_dump(cfg, sort_keys=False), encoding="utf-8")
    os.environ["EDGE_CONFIG_PATH"] = str(cfg_path)  # environment beats .env, so the demo config is used

    logs = folder / "logs"
    logs.mkdir(exist_ok=True)
    log_path = logs / f"demo-{'full' if a.full else 'quick'}-{datetime.now():%Y%m%d-%H%M%S}.txt"
    log_file = log_path.open("w", encoding="utf-8")
    sys.stdout = Tee(sys.__stdout__, log_file)  # type: ignore[assignment]
    sys.stderr = Tee(sys.__stderr__, log_file)  # type: ignore[assignment]

    lv = cfg.get("liveview", {})
    print(f"AttendIQ demo ({'FULL 10-minute class' if a.full else 'quick test'})\n"
          f"  door video: {door.name}\n  room video: {room.name}\n  section:    {settings['section']}\n"
          f"  live view:  http://{lv.get('host', '127.0.0.1')}:{lv.get('port', 8090)}\n  log:        {log_path}\n")
    if not a.no_browser:
        _open_later([f"http://{lv.get('host', '127.0.0.1')}:{lv.get('port', 8090)}"], 4.0)

    from edge.__main__ import main as edge_main

    try:
        return edge_main(edge_args(door, room, settings, a.full))
    finally:
        print(f"\nLog saved: {log_path}")
        sys.stdout, sys.stderr = sys.__stdout__, sys.__stderr__
        log_file.close()


if __name__ == "__main__":
    raise SystemExit(main())
