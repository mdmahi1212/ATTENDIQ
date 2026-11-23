"""Final room check, run when the professor ends the class: ~30 s of the room camera, BOTH bodies and faces.

- people in the room = the median of the per-frame body counts in the seat area (one frame can miss or double-count
  someone; the median over ~150 frames does not), plus the highest count seen;
- who is there = faces recognised at least twice in the window + bodies the body tracker already knows by name
  (people looking down or turned away are still named from earlier in class);
- unknown faces = clear faces matching nobody in the class.
"""

from __future__ import annotations

import statistics
import threading
from collections import Counter
from collections.abc import Callable, Iterable, Sequence
from typing import Any

from edge.decision import Thresholds
from edge.gallery import Gallery
from edge.gate import FaceDet

WINDOW_S = 30.0
MIN_SIGHTINGS = 2


class FinalCheck:
    def __init__(self, gallery: Gallery, thr: Thresholds, report: Callable[[dict[str, Any]], None],
                 window_s: float = WINDOW_S) -> None:
        self.gallery, self.thr, self._report, self.window_s = gallery, thr, report, window_s
        self._lock = threading.Lock()
        self._start: float | None = None
        self._counts: list[int] = []
        self._faces: Counter[str] = Counter()
        self._bodies: set[str] = set()
        self._unknown = 0

    @property
    def running(self) -> bool:
        return self._start is not None

    def start(self, t: float) -> None:
        with self._lock:
            self._start = t
            self._counts, self._faces, self._bodies, self._unknown = [], Counter(), set(), 0

    def bodies(self, seated: int, named: Iterable[str | None], t: float) -> None:
        """One room-camera frame: people counted in the seat area + names the body tracker knows."""
        with self._lock:
            if self._start is None:
                return
            self._counts.append(seated)
            self._bodies.update(n for n in named if n)
        self._maybe_finish(t)

    def faces(self, faces: Sequence[FaceDet], t: float) -> None:
        with self._lock:
            if self._start is None:
                return
            for f in faces:
                if f.embedding is None:
                    continue
                m = self.gallery.match(f.embedding)
                if m.student_id and m.score >= self.thr.accept and m.margin >= self.thr.margin:
                    self._faces[m.student_id] += 1
                elif m.score < 0.30:
                    self._unknown += 1
        self._maybe_finish(t)

    def _maybe_finish(self, t: float) -> None:
        with self._lock:
            if self._start is None or t - self._start < self.window_s:
                return
            result = self.result(t)
            self._start = None
        self._report(result)

    def result(self, t: float) -> dict[str, Any]:
        """Call with the lock held (or from tests)."""
        counts = self._counts or [0]
        named = {s for s, n in self._faces.items() if n >= MIN_SIGHTINGS} | self._bodies
        return {
            "count": int(round(statistics.median(counts))),
            "count_max": max(counts),
            "students": sorted(named),
            "unknown_faces": min(self._unknown, 99),
            "window_s": round(t - (self._start if self._start is not None else t), 1),
            "frames": len(self._counts),
        }
