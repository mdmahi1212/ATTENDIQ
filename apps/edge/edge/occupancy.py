"""Inside camera: how many people are in the seat area (never WHO). Only triggers verification.

YOLOv8n "person" boxes -> keep those whose bottom-centre (feet/seat point) is inside the seat ROI ->
median over the last N samples -> `stable` once the smoothed value has not changed for stable_seconds.
"""

from __future__ import annotations

import statistics
from collections import deque
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Protocol

import numpy as np

Box = tuple[float, float, float, float]
Point = tuple[float, float]


def point_in_polygon(p: Point, poly: Sequence[Point]) -> bool:
    """Ray casting; same answer as cv2.pointPolygonTest(...) >= 0 for points not exactly on an edge."""
    x, y = p
    inside = False
    n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % n]
        if (y1 > y) != (y2 > y):
            xin = x1 + (y - y1) * (x2 - x1) / (y2 - y1)
            if x < xin:
                inside = not inside
    return inside


def in_roi(boxes: Sequence[Box], roi_norm: Sequence[Point] | None, w: int, h: int) -> list[Box]:
    if not roi_norm:
        return list(boxes)
    poly = [(x * w, y * h) for x, y in roi_norm]
    return [b for b in boxes if point_in_polygon(((b[0] + b[2]) / 2, b[3]), poly)]


@dataclass(frozen=True)
class Sample:
    raw: int
    smoothed: int
    stable: bool


class OccupancyCounter:
    def __init__(self, window: int = 10, stable_seconds: float = 60.0) -> None:
        self._values: deque[int] = deque(maxlen=window)
        self.stable_seconds = stable_seconds
        self._last_smoothed: int | None = None
        self._since: float | None = None

    def add(self, raw: int, t: float) -> Sample:
        self._values.append(raw)
        smoothed = int(round(statistics.median(self._values)))
        if smoothed != self._last_smoothed:
            self._last_smoothed, self._since = smoothed, t
        stable = self._since is not None and t - self._since >= self.stable_seconds
        return Sample(raw, smoothed, stable)

    def reset(self) -> None:
        self._values.clear()
        self._last_smoothed = self._since = None


class PersonDetector(Protocol):
    def __call__(self, frame: np.ndarray) -> list[Box]: ...


class YoloPersonDetector:
    def __init__(self, weights: str = "yolov8n.pt", conf: float = 0.4) -> None:
        from ultralytics import YOLO

        self._model = YOLO(weights)
        self.conf = conf

    def __call__(self, frame: np.ndarray) -> list[Box]:
        res = self._model.predict(frame, classes=[0], conf=self.conf, verbose=False)[0]
        return [tuple(float(v) for v in b) for b in res.boxes.xyxy.tolist()]  # type: ignore[misc]


def annotate(frame: np.ndarray, boxes: Sequence[Box], kept: Sequence[Box], roi_norm: Sequence[Point] | None,
             count: int) -> np.ndarray:
    """Debug image: ROI polygon, counted boxes green, ignored boxes grey."""
    import cv2

    out = frame.copy()
    h, w = out.shape[:2]
    if roi_norm:
        pts = np.array([[int(x * w), int(y * h)] for x, y in roi_norm], np.int32)
        cv2.polylines(out, [pts], True, (255, 200, 0), 2)
    keep = set(kept)
    for b in boxes:
        c = (0, 200, 0) if b in keep else (150, 150, 150)
        cv2.rectangle(out, (int(b[0]), int(b[1])), (int(b[2]), int(b[3])), c, 2)
    cv2.putText(out, f"count {count}", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
    return out
