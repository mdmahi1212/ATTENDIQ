"""Small IoU tracker for face boxes: one walk through the door = one track_id (ByteTrack-style greedy matching)."""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from edge.geometry import Box, Point, centre, iou


@dataclass
class Track:
    track_id: int
    box: Box
    first_seen: float
    last_seen: float
    history: list[Point] = field(default_factory=list)
    embeddings: list[tuple[float, np.ndarray]] = field(default_factory=list)  # (quality, unit vector)
    direction: str | None = None   # set once when it crosses the entry line
    decided: bool = False
    student_id: str | None = None
    missed: int = 0

    def add_embedding(self, quality: float, emb: np.ndarray, keep: int) -> None:
        self.embeddings.append((quality, emb))
        self.embeddings.sort(key=lambda x: -x[0])
        del self.embeddings[keep:]


class IouTracker:
    def __init__(self, iou_min: float = 0.25, max_missed: int = 8, keep_embeddings: int = 5) -> None:
        self.iou_min = iou_min
        self.max_missed = max_missed
        self.keep = keep_embeddings
        self.tracks: dict[int, Track] = {}
        self._next = 1

    def update(self, dets: list[tuple[Box, float, np.ndarray | None]], t: float) -> tuple[list[Track], list[Track]]:
        """dets = (box, quality, embedding|None). Returns (active tracks touched this frame, tracks that ended)."""
        pairs = sorted(((iou(tr.box, d[0]), tid, i) for tid, tr in self.tracks.items() for i, d in enumerate(dets)),
                       reverse=True)
        used_t: set[int] = set()
        used_d: set[int] = set()
        touched: list[Track] = []
        for score, tid, i in pairs:
            if score < self.iou_min or tid in used_t or i in used_d:
                continue
            used_t.add(tid)
            used_d.add(i)
            touched.append(self._apply(self.tracks[tid], dets[i], t))
        for i, d in enumerate(dets):
            if i not in used_d:
                tr = Track(self._next, d[0], t, t)
                self._next += 1
                self.tracks[tr.track_id] = tr
                touched.append(self._apply(tr, d, t))
        ended: list[Track] = []
        for tid in list(self.tracks):
            if tid not in used_t and all(tr.track_id != tid for tr in touched):
                tr = self.tracks[tid]
                tr.missed += 1
                if tr.missed > self.max_missed:
                    ended.append(self.tracks.pop(tid))
        return touched, ended

    def _apply(self, tr: Track, det: tuple[Box, float, np.ndarray | None], t: float) -> Track:
        tr.box, tr.last_seen, tr.missed = det[0], t, 0
        tr.history.append(centre(det[0]))
        del tr.history[:-60]
        if det[2] is not None:
            tr.add_embedding(det[1], det[2], self.keep)
        return tr

    def clear(self) -> list[Track]:
        ended = list(self.tracks.values())
        self.tracks.clear()
        return ended
