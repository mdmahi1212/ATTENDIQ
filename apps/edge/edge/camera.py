"""Threaded camera reader that always keeps only the NEWEST frame.

Sources: MJPEG/RTSP URL (phone IP Webcam), webcam index ("0"), or a video file (played at real-time speed
so tests are repeatable). Reconnects with exponential backoff and reports offline/online transitions.
"""

from __future__ import annotations

import logging
import threading
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any, Protocol

import numpy as np

log = logging.getLogger("edge.camera")


class Capture(Protocol):
    def isOpened(self) -> bool: ...  # noqa: N802 - OpenCV API
    def read(self) -> tuple[bool, Any]: ...
    def release(self) -> None: ...
    def get(self, prop: int) -> float: ...


def open_capture(source: str) -> Capture:
    import cv2

    if source.isdigit():
        return cv2.VideoCapture(int(source), cv2.CAP_DSHOW)
    return cv2.VideoCapture(source)


def is_file(source: str) -> bool:
    return not source.isdigit() and "://" not in source and Path(source).exists()


class Backoff:
    def __init__(self, base: float = 1.0, cap: float = 30.0) -> None:
        self.base, self.cap, self.n = base, cap, 0

    def next(self) -> float:
        d = min(self.cap, self.base * (2 ** min(self.n, 16)))
        self.n += 1
        return d

    def reset(self) -> None:
        self.n = 0


class Camera:
    def __init__(self, name: str, source: str, on_status: Callable[[str, bool, int], None] | None = None,
                 opener: Callable[[str], Capture] = open_capture, loop_file: bool = False,
                 sleep: Callable[[float], None] = time.sleep, hold_last: bool = False) -> None:
        self.name, self.source = name, source
        self._open, self._on_status, self._sleep = opener, on_status, sleep
        self._loop_file = loop_file
        # Recorded demo: at the end of a file keep showing the last frame and stay "online", so a finished
        # recording is not reported as camera downtime while the class is still running.
        self._hold_last = hold_last
        self._lock = threading.Lock()
        self._frame: np.ndarray | None = None
        self._frame_at = 0.0
        self._seq = 0
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self.online: bool | None = None  # unknown until the first open attempt, so the first state is reported
        self.failures = 0
        self.fps = 0.0
        self.ended = False

    def start(self) -> None:
        self._thread = threading.Thread(target=self._run, name=f"camera-{self.name}", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=5)

    def latest(self) -> tuple[int, np.ndarray | None, float]:
        """(sequence number, frame, monotonic time it was read). Same seq = no new frame."""
        with self._lock:
            return self._seq, self._frame, self._frame_at

    def frame_age(self) -> float | None:
        with self._lock:
            return None if self._frame is None else time.monotonic() - self._frame_at

    def _set_online(self, online: bool) -> None:
        if online != self.online:
            self.online = online
            log.warning("camera %s %s", self.name, "ONLINE" if online else "OFFLINE")
            if self._on_status:
                self._on_status(self.name, online, self.failures)

    def _run(self) -> None:
        backoff = Backoff()
        file_mode = is_file(self.source)
        while not self._stop.is_set():
            cap = self._open(self.source)
            if not cap.isOpened():
                self.failures += 1
                self._set_online(False)
                if self.failures == 3:
                    log.error("camera %s failed 3 times (%s)", self.name, self.source)
                self._sleep(backoff.next())
                continue
            backoff.reset()
            self.failures = 0
            fps_src = cap.get(5) if file_mode else 0  # CAP_PROP_FPS
            frame_dt = 1.0 / fps_src if fps_src and fps_src > 0 else 0.0
            n, t_fps = 0, time.monotonic()
            while not self._stop.is_set():
                t_read = time.monotonic()
                ok, frame = cap.read()
                if not ok or frame is None:
                    break
                with self._lock:
                    self._frame, self._frame_at, self._seq = frame, time.monotonic(), self._seq + 1
                self._set_online(True)
                n += 1
                if time.monotonic() - t_fps >= 2:
                    self.fps, n, t_fps = n / (time.monotonic() - t_fps), 0, time.monotonic()
                if frame_dt:  # play files at real-time speed
                    self._sleep(max(0.0, frame_dt - (time.monotonic() - t_read)))
            cap.release()
            if file_mode and not self._loop_file:
                self.ended = True
                if self._hold_last:
                    log.info("camera %s: recording ended, holding the last frame", self.name)
                else:
                    self._set_online(False)
                return
            self.failures += 1
            self._set_online(False)
            self._sleep(backoff.next())


def rotate_frame(frame: np.ndarray, degrees: int) -> np.ndarray:
    """Clockwise rotation for phones streaming sideways (IP Webcam sends the sensor's landscape image)."""
    import cv2

    codes = {90: cv2.ROTATE_90_CLOCKWISE, 180: cv2.ROTATE_180, 270: cv2.ROTATE_90_COUNTERCLOCKWISE}
    return frame if degrees % 360 == 0 else cv2.rotate(frame, codes[degrees % 360])
