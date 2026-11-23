"""Camera geometry drawn on the website (Operator -> camera) applied to the running edge, and camera snapshots sent
back so the geometry can be drawn on a current picture. Points are normalised (0..1) to the ROTATED frame."""

from __future__ import annotations

import logging
import re
import threading
import time
from collections.abc import Callable
from dataclasses import replace
from typing import Any

import numpy as np

from edge.geometry import Point, side

log = logging.getLogger("edge.geometry")


def _pts(v: Any, n: int | None = None) -> list[Point] | None:
    if not isinstance(v, list) or (n is not None and len(v) != n):
        return None
    out: list[Point] = []
    for p in v:
        if not (isinstance(p, list | tuple) and len(p) == 2 and all(isinstance(c, int | float) and 0 <= c <= 1 for c in p)):
            return None
        out.append((float(p[0]), float(p[1])))
    return out


def out_side(a: Point, b: Point, door: Point) -> int | None:
    """+1 / -1 = which side of the line a->b the door is on (side() sign); None if the point is on the line."""
    s = side(door, a, b)
    return None if s == 0 else (1 if s > 0 else -1)


def stream_choices(cameras: list[dict[str, Any]]) -> dict[str, str]:
    """kind -> stream address picked on the website (only http(s) addresses)."""
    out: dict[str, str] = {}
    for c in cameras:
        url = str(c.get("stream_url") or "").strip()
        if c.get("kind") in ("gate", "inside") and re.fullmatch(r"(https?|rtsp)://[A-Za-z0-9.\-]+(:\d+)?(/\S*)?", url):
            out[str(c["kind"])] = url
    return out


def plan(cameras: list[dict[str, Any]]) -> dict[str, Any]:
    """What to change, from the website rows: {roi, entry_line, exit_line, out_side} (only valid, drawn values)."""
    out: dict[str, Any] = {}
    for c in cameras:
        if c.get("kind") == "inside":
            roi = _pts(c.get("roi"))
            if roi and len(roi) >= 3:
                out["roi"] = roi
            line = _pts(c.get("exit_line"), 2)
            door = _pts([c["door_point"]], 1) if c.get("door_point") else None
            if line and door and (o := out_side(line[0], line[1], door[0])) is not None:
                out["exit_line"], out["out_side"] = line, o
        elif c.get("kind") == "gate" and (line := _pts(c.get("entry_line"), 2)):
            out["entry_line"] = line
    return out


def apply(changes: dict[str, Any], cfg: Any, gate: Any, exit_gate: Any, body_exit: Any) -> list[str]:
    """Applies a plan to the live config + pipelines. Returns what changed (for the log)."""
    done: list[str] = []
    if "roi" in changes and [tuple(p) for p in cfg.inside.roi] != changes["roi"]:
        cfg.inside.roi = changes["roi"]
        done.append("seat area")
    if "exit_line" in changes:
        a, b = changes["exit_line"]
        o = changes["out_side"]
        if (tuple(cfg.exit.line_a), tuple(cfg.exit.line_b), cfg.exit.out_side) != (a, b, o):
            cfg.exit.line_a, cfg.exit.line_b, cfg.exit.out_side = a, b, o
            if exit_gate is not None:
                exit_gate.cfg = replace(exit_gate.cfg, line_a=a, line_b=b, in_side=-o)
            if body_exit is not None:
                body_exit.line_a, body_exit.line_b, body_exit.out_side = a, b, o
            done.append("exit line")
    if "entry_line" in changes:
        a, b = changes["entry_line"]
        if (tuple(gate.cfg.line_a), tuple(gate.cfg.line_b)) != (a, b):
            gate.cfg = replace(gate.cfg, line_a=a, line_b=b)
            done.append("entry line")
    return done


class SnapshotSender:
    """Sends one camera picture every `every_s` seconds (first one right away), in a background thread."""

    def __init__(self, send: Callable[[str, bytes], None], every_s: float = 120.0, max_width: int = 1280) -> None:
        self._send, self.every_s, self.max_width = send, every_s, max_width
        self._next: dict[str, float] = {}
        self._busy: set[str] = set()
        self._lock = threading.Lock()

    def due(self, kind: str, now: float | None = None) -> bool:
        now = time.monotonic() if now is None else now
        with self._lock:
            return kind not in self._busy and now >= self._next.get(kind, 0.0)

    def offer(self, kind: str, frame: np.ndarray) -> None:
        """Call with every frame; only sends when due."""
        if not self.due(kind):
            return
        import cv2

        h, w = frame.shape[:2]
        if w > self.max_width:
            frame = cv2.resize(frame, (self.max_width, int(h * self.max_width / w)))
        ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
        if not ok:
            return
        with self._lock:
            self._busy.add(kind)
            self._next[kind] = time.monotonic() + self.every_s
        threading.Thread(target=self._run, args=(kind, buf.tobytes()), daemon=True, name=f"snapshot-{kind}").start()

    def _run(self, kind: str, jpeg: bytes) -> None:
        try:
            self._send(kind, jpeg)
        except Exception as e:  # noqa: BLE001 - a failed snapshot must never stop the cameras
            log.warning("snapshot %s not sent: %s", kind, e)
        finally:
            with self._lock:
                self._busy.discard(kind)
