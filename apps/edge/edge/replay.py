"""Recorded-video presentation helpers: class length from the videos, waiting for the outbox, result table."""

from __future__ import annotations

import math
import time
from collections.abc import Callable
from typing import Any


def video_seconds(path: str, skip_s: float = 0.0) -> float:
    """Playable length of a video file after skipping skip_s seconds (0 when it cannot be read)."""
    import cv2

    cap = cv2.VideoCapture(path)
    try:
        fps, frames = cap.get(cv2.CAP_PROP_FPS), cap.get(cv2.CAP_PROP_FRAME_COUNT)
    finally:
        cap.release()
    if not fps or fps <= 0 or frames <= 0:
        return 0.0
    return max(0.0, frames / fps - skip_s)


DEMO_END_ALERT_MIN = 2  # matches DEMO_POLICY.recheck_before_end_min in apps/web/lib/edge/schemas.ts


def full_class_minutes(video_s: float, requested: int | None = None) -> int:
    """--full-class: the class lasts as long as the videos (it then ends by itself), at least the DB minimum of 10."""
    if requested:
        return min(60, max(10, requested))
    return min(60, max(10, math.ceil(video_s / 60)))


def class_minutes(video_s: float) -> int:
    """Scheduled class length: the videos + 2 min margin, at least the DB minimum of 10 (it is ended early anyway)."""
    return min(60, max(10, math.ceil(video_s / 60) + 2))


def wait_until_sent(pending: Callable[[], int], flush: Callable[[], Any] | None, timeout_s: float = 30.0,
                    sleep: Callable[[float], None] = time.sleep) -> bool:
    """Wait until the outbox is empty (every decision reached the server) before the class is ended."""
    deadline = time.monotonic() + timeout_s
    while pending() > 0:
        if time.monotonic() >= deadline:
            return False
        if flush:
            flush()
        sleep(0.5)
    return True


def format_results(res: dict[str, Any]) -> str:
    rank = {"present": 0, "late": 1, "excused": 2, "left_early": 3, "absent": 4, "pending": 5}
    rows = sorted(res.get("attendance", []), key=lambda a: (rank.get(str(a.get("status")), 9), str(a.get("name"))))
    width = max([len(str(a.get("name"))) for a in rows] + [7])
    lines = ["", "Final attendance", f"{'Student':<{width}}  Status    Flags / note", "-" * (width + 40)]
    for a in rows:
        extra = ", ".join(a.get("flags") or [])
        if a.get("note"):
            extra = f"{extra}  {a['note']}".strip()
        lines.append(f"{a.get('name')!s:<{width}}  {a.get('status')!s:<8}  {extra}")
    lines.append(f"Unknown people at the door: {res.get('unknown_entries', 0)}")
    return "\n".join(lines)


def print_results(res: dict[str, Any]) -> None:
    print(format_results(res), flush=True)
