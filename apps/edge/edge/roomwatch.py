"""Room camera face report (rules B, C, E): who the room camera actually sees during class.

- ROOM_SEEN {student_id}: an enrolled student's face recognised in the room, at most once a minute per student.
  At the end the database flags door-marked or self-verified students never seen in the room as 'unconfirmed'.
- ROOM_UNKNOWN_FACE {score}: a clear face that matches nobody in this class, seen in several frames, at most once
  every 2 minutes (a stand-in sitting in for someone?). The professor is alerted. No picture or embedding is sent.
"""

from __future__ import annotations

from collections import deque
from collections.abc import Callable, Sequence

from edge.decision import Thresholds
from edge.gallery import Gallery
from edge.gate import FaceDet

SEEN_EVERY_S = 60.0
UNKNOWN_EVERY_S = 120.0
UNKNOWN_FRAMES = 5  # frames with an unknown clear face ...
UNKNOWN_WINDOW_S = 10.0  # ... within this many seconds
UNKNOWN_BELOW = 0.30  # best match clearly below the accept threshold (not a borderline enrolled student)


class RoomWatcher:
    def __init__(self, gallery: Gallery, thr: Thresholds, seen: Callable[[str], None],
                 unknown: Callable[[float], None], min_face_px: int = 50) -> None:
        self.gallery, self.thr, self._seen, self._unknown, self.min_face_px = gallery, thr, seen, unknown, min_face_px
        self._last_seen: dict[str, float] = {}
        self._unknown_frames: deque[float] = deque()
        self._last_unknown = -1e9

    def reset(self) -> None:
        self._last_seen.clear()
        self._unknown_frames.clear()
        self._last_unknown = -1e9

    def update(self, faces: Sequence[FaceDet], t: float) -> None:
        if len(self.gallery) == 0:
            return
        unknown_best: float | None = None
        for f in faces:
            if f.embedding is None or f.box[2] - f.box[0] < self.min_face_px:
                continue
            m = self.gallery.match(f.embedding)
            if m.student_id and m.score >= self.thr.accept and m.margin >= self.thr.margin:
                if t - self._last_seen.get(m.student_id, -1e9) >= SEEN_EVERY_S:
                    self._last_seen[m.student_id] = t
                    self._seen(m.student_id)
            elif m.score < UNKNOWN_BELOW:
                unknown_best = m.score if unknown_best is None else max(unknown_best, m.score)
        if unknown_best is None:
            return
        self._unknown_frames.append(t)
        while self._unknown_frames and t - self._unknown_frames[0] > UNKNOWN_WINDOW_S:
            self._unknown_frames.popleft()
        if len(self._unknown_frames) >= UNKNOWN_FRAMES and t - self._last_unknown >= UNKNOWN_EVERY_S:
            self._last_unknown = t
            self._unknown_frames.clear()
            self._unknown(round(unknown_best, 3))
