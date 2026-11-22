"""Bodies as well as faces on both cameras.

BodyExitTracker (inside camera) - exit by BODY: catches people who leave without showing their face.

The inside camera already finds every person's body (YOLO) and every visible face (InsightFace). This tracker
follows each body box over time and remembers whose face was seen inside it (the face's centre in the upper part
of the body box, matched against the class gallery with the gate thresholds). When a body crosses the exit line
toward the door it reports an OUT:

- with the student it remembered, even if the face is turned away at the door (the face camera alone misses this);
- without a student when the face was never seen ("someone left"): the LED goes amber, the event is logged and the
  room count drops, so the professor's count check still catches it.

A student whose face the exit camera already reported as OUT is not reported twice.

DoorBodyWatcher (door camera): a person walking in whose face is never found is reported as an unknown entry.
"""

from __future__ import annotations

import threading
from collections import Counter
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field

from edge.decision import SessionMemory, Thresholds
from edge.gallery import Gallery
from edge.gate import FaceDet
from edge.geometry import Box, Point, crossing
from edge.tracker import IdTracker, IouTracker

FACE_FRESH_S = 1.0  # a face counts for a body only if it was seen this recently
MIN_VOTES = 2  # frames in which the same student's face was inside the body before we trust the identity


@dataclass
class _Who:
    votes: Counter[str] = field(default_factory=Counter)
    counted: set[int] = field(default_factory=set)  # face sightings already counted for this body
    reported: bool = False


class BodyExitTracker:
    def __init__(self, line_a: Point, line_b: Point, out_side: int, gallery: Gallery, memory: SessionMemory,
                 thr: Thresholds, report: Callable[[str | None, dict[str, object]], None],
                 min_travel_px: float = 40.0) -> None:
        self.line_a, self.line_b, self.out_side = line_a, line_b, out_side
        self.gallery, self.memory, self.thr, self._report = gallery, memory, thr, report
        self.min_travel_px = min_travel_px
        self.tracker: IouTracker | IdTracker = IouTracker(iou_min=0.2, max_missed=6, keep_embeddings=0)  # ~30-60 px/frame
        self._who: dict[int, _Who] = {}
        self._faces: list[tuple[Point, str, float, int]] = []  # (face centre px, student, t, sighting id)
        self._seq = 0
        self.stats = {"out_known": 0, "out_unknown": 0, "skipped_already_out": 0}
        self._lock = threading.Lock()  # faces() runs in the exit loop, update() in the body loop

    def reset(self) -> None:
        with self._lock:
            self._reset()

    def _reset(self) -> None:
        self.tracker.clear()
        self._who.clear()
        self._faces.clear()

    # ------------------------------------------------------------ input from the exit (face) loop
    def faces(self, faces: Sequence[FaceDet], t: float) -> None:
        """Recognised faces of the latest inside-camera frame (same rotation as the body frames)."""
        recognised: list[tuple[Point, str, float, int]] = []
        for f in faces:
            if f.embedding is None:
                continue
            m = self.gallery.match(f.embedding)
            if m.student_id and m.score >= self.thr.accept and m.margin >= self.thr.margin:
                b = f.box
                self._seq += 1
                recognised.append((((b[0] + b[2]) / 2, (b[1] + b[3]) / 2), m.student_id, t, self._seq))
        with self._lock:
            self._faces = [f for f in self._faces if t - f[2] <= FACE_FRESH_S] + recognised

    # ------------------------------------------------------------ input from the body (YOLO) loop
    def update(self, bodies: Sequence[Box], w: int, h: int, t: float, ids: Sequence[int | None] | None = None) -> None:
        """ids: body ids from BoT-SORT + ReID (switches to id tracking for the session); None = box-overlap tracking."""
        with self._lock:
            if ids is not None and not isinstance(self.tracker, IdTracker):
                self.tracker = IdTracker(max_missed=6)
            out = self._update(bodies, w, h, t, ids)
        for track_id, who in out:  # report outside the lock (it emits an event)
            self._on_out(track_id, who)

    def _update(self, bodies: Sequence[Box], w: int, h: int, t: float,
                ids: Sequence[int | None] | None) -> list[tuple[int, _Who]]:
        out: list[tuple[int, _Who]] = []
        if isinstance(self.tracker, IdTracker):
            touched, ended = self.tracker.update(list(zip(bodies, ids or [None] * len(bodies), strict=True)), t)
        else:
            touched, ended = self.tracker.update([(b, 0.0, None) for b in bodies], t)
        for tr in ended:
            self._who.pop(tr.track_id, None)
        a = (self.line_a[0] * w, self.line_a[1] * h)
        b = (self.line_b[0] * w, self.line_b[1] * h)
        for tr in touched:
            who = self._who.setdefault(tr.track_id, _Who())
            x1, y1, x2, y2 = tr.box
            upper = y1 + (y2 - y1) * 0.5  # faces sit in the upper half of a body box
            for (fx, fy), sid, ft, seq in self._faces:
                if seq not in who.counted and t - ft <= FACE_FRESH_S and x1 <= fx <= x2 and y1 <= fy <= upper:
                    who.counted.add(seq)  # one vote per face sighting, however many body frames follow
                    who.votes[sid] += 1
            if who.reported:
                continue
            # the room is on the side opposite the door: in_side = -out_side, so "out" = toward the door
            if crossing(tr.history, a, b, -self.out_side, self.min_travel_px) == "out":
                who.reported = True
                out.append((tr.track_id, who))
        return out

    def identity(self, track_id: int) -> str | None:
        return self._identity(self._who.get(track_id))

    @staticmethod
    def _identity(who: _Who | None) -> str | None:
        if not who or not who.votes:
            return None
        sid, n = who.votes.most_common(1)[0]
        return sid if n >= MIN_VOTES else None

    def _on_out(self, track_id: int, who: _Who) -> None:
        sid = self._identity(who)
        if sid and sid in self.memory.left:
            self.stats["skipped_already_out"] += 1  # the face camera reported this student already
            return
        self.stats["out_known" if sid else "out_unknown"] += 1
        self._report(sid, {"body_track_id": track_id, "via": "body", "face_votes": dict(who.votes)})


class DoorBodyWatcher:
    """Door camera: follows BODIES as well as faces. A person who walks in while no face is ever found inside their
    body box (head down, hood, turned away) is reported as an unknown entry (LED red), instead of passing unseen.
    People whose face was found are left to the face pipeline (recognised or unknown face)."""

    def __init__(self, report: Callable[[dict[str, object]], None], min_seen_s: float = 1.0) -> None:
        self._report, self.min_seen_s = report, min_seen_s
        self.tracker: IouTracker | IdTracker = IouTracker(iou_min=0.2, max_missed=6, keep_embeddings=0)
        self._face_seen: dict[int, bool] = {}
        self.stats = {"bodies": 0, "no_face_entries": 0}

    def reset(self) -> None:
        self.tracker.clear()
        self._face_seen.clear()

    def update(self, bodies: Sequence[Box], faces: Sequence[FaceDet], t: float,
               ids: Sequence[int | None] | None = None) -> None:
        if ids is not None and not isinstance(self.tracker, IdTracker):
            self.tracker = IdTracker(max_missed=6)
        if isinstance(self.tracker, IdTracker):
            touched, ended = self.tracker.update(list(zip(bodies, ids or [None] * len(bodies), strict=True)), t)
        else:
            touched, ended = self.tracker.update([(b, 0.0, None) for b in bodies], t)
        for tr in touched:
            if tr.track_id not in self._face_seen:
                self._face_seen[tr.track_id] = False
                self.stats["bodies"] += 1
            x1, y1, x2, y2 = tr.box
            if any(x1 <= (f.box[0] + f.box[2]) / 2 <= x2 and y1 <= (f.box[1] + f.box[3]) / 2 <= y2 for f in faces):
                self._face_seen[tr.track_id] = True
        for tr in ended:
            face_seen = self._face_seen.pop(tr.track_id, True)
            if not face_seen and tr.last_seen - tr.first_seen >= self.min_seen_s:
                self.stats["no_face_entries"] += 1
                self._report({"body_track_id": tr.track_id, "via": "body", "face": "not seen",
                              "seconds": round(tr.last_seen - tr.first_seen, 1)})

    def flush(self) -> None:
        """Decide bodies still in view (shutdown / session end)."""
        for tr in self.tracker.clear():
            if not self._face_seen.pop(tr.track_id, True) and tr.last_seen - tr.first_seen >= self.min_seen_s:
                self.stats["no_face_entries"] += 1
                self._report({"body_track_id": tr.track_id, "via": "body", "face": "not seen"})
