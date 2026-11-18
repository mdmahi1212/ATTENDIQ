"""Pure geometry: IoU, line side / crossing direction."""

from __future__ import annotations

from collections.abc import Sequence

Box = tuple[float, float, float, float]  # x1, y1, x2, y2 (pixels)
Point = tuple[float, float]


def iou(a: Box, b: Box) -> float:
    ix1, iy1, ix2, iy2 = max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])
    inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
    union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / union if union > 0 else 0.0


def centre(b: Box) -> Point:
    return ((b[0] + b[2]) / 2, (b[1] + b[3]) / 2)


def side(p: Point, a: Point, b: Point) -> float:
    """Sign of the 2-D cross product in IMAGE coordinates (y grows downward): for a left-to-right line,
    points BELOW it are > 0 and points above are < 0; 0 = on the line."""
    return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])


def crossing(history: Sequence[Point], a: Point, b: Point, in_side: int, min_travel: float = 0.0) -> str | None:
    """'in' / 'out' when the track went from one side of the entry line to the other, else None.

    in_side: +1 if the room is on the side where side() > 0 (below a left-to-right line), -1 for the other
    side. Uses the first and last points so
    jitter around the line does not count; min_travel (pixels) ignores tiny movements.
    """
    if len(history) < 2:
        return None
    s0, s1 = side(history[0], a, b), side(history[-1], a, b)
    if s0 == 0 or s1 == 0 or (s0 > 0) == (s1 > 0):
        return None
    dx, dy = history[-1][0] - history[0][0], history[-1][1] - history[0][1]
    if (dx * dx + dy * dy) ** 0.5 < min_travel:
        return None
    return "in" if (s1 > 0) == (in_side > 0) else "out"
