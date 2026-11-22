"""Room map for the live dashboard: where each person is (feet point, 0..1 of the room camera picture) and, when the
body tracker knows whose face it saw, which student. Positions only: no picture, no face, no embedding."""

from __future__ import annotations

from collections.abc import Callable, Sequence
from typing import Any

from edge.geometry import Box

MAX_PEOPLE = 60


def room_people(boxes: Sequence[Box], ids: Sequence[int | None] | None, w: int, h: int,
                identity: Callable[[int], str | None] | None) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for i, b in enumerate(boxes[:MAX_PEOPLE]):
        x = min(1.0, max(0.0, (b[0] + b[2]) / 2 / w))
        y = min(1.0, max(0.0, b[3] / h))  # feet
        p: dict[str, Any] = {"x": round(x, 3), "y": round(y, 3)}
        tid = ids[i] if ids is not None and i < len(ids) else None
        sid = identity(tid) if identity and tid is not None else None
        if sid:
            p["student_id"] = sid
        out.append(p)
    return out
