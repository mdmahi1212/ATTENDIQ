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
from edge.geometry import Box, Point, crossing, side
from edge.tracker import IdTracker, IouTracker


def seg_dist(p: Point, a: Point, b: Point) -> float:
    """Distance from p to the segment a-b (pixels)."""
    ax, ay, bx, by = a[0], a[1], b[0], b[1]
    dx, dy = bx - ax, by - ay
    t = 0.0 if dx == dy == 0 else max(0.0, min(1.0, ((p[0] - ax) * dx + (p[1] - ay) * dy) / (dx * dx + dy * dy)))
    return float(((p[0] - ax - t * dx) ** 2 + (p[1] - ay - t * dy) ** 2) ** 0.5)


FACE_FRESH_S = 1.0  # a face counts for a body only if it was seen this recently
MIN_VOTES = 2  # frames in which the same student's face was inside the body before we trust the identity


@dataclass
class _Who:
    votes: Counter[str] = field(default_factory=Counter)
    counted: set[int] = field(default_factory=set)  # face sightings already counted for this body
    start: tuple[float, float] | None = None  # where this body was first seen (px, box centre)
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
        self.vanished: list[tuple[str, float]] = []  # (student, time) named bodies lost near the door
        self.edge_mode = False  # set when the exit line lies on a picture border (door outside the picture)
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
        a = (self.line_a[0] * w, self.line_a[1] * h)
        b = (self.line_b[0] * w, self.line_b[1] * h)
        for tr in ended:
            who = self._who.pop(tr.track_id, None)
            sid = self._identity(who)
            if sid and who and not who.reported and tr.history:
                x, y = tr.history[-1]
                feet = ((tr.box[0] + tr.box[2]) / 2, tr.box[3])  # where the person stands, not the box centre
                near = 0.08 * max(w, h)
                sx, sy = who.start or tr.history[0]
                walked = ((x - sx) ** 2 + (y - sy) ** 2) ** 0.5 >= 0.12 * h
                at_border = tr.box[0] <= 0.02 * w or tr.box[2] >= 0.98 * w or tr.box[3] >= 0.97 * h
                # was already in the room: seen >= 15 s and first seen away from the side / bottom edges (not arriving)
                settled = tr.last_seen - tr.first_seen >= 15 and 0.12 * w < sx < 0.88 * w and sy < 0.85 * h
                if self.edge_mode and walked and at_border and settled:
                    # Door outside the picture (exit line drawn on a picture edge): someone who got up and walked out
                    # of the picture at the left / right / bottom edge left. Seen again later = back (the DB fixes it).
                    who.reported = True
                    out.append((tr.track_id, who))
                    continue
                if seg_dist(feet, a, b) <= near and seg_dist(tr.history[0], a, b) - seg_dist((x, y), a, b) >= 0.12 * h:
                    # Walked up to the exit line and vanished there (e.g. a line on the picture's edge with the door
                    # behind the camera: people leave the picture before "crossing"): that is leaving.
                    who.reported = True
                    out.append((tr.track_id, who))
                    continue
                # Disappeared elsewhere on the door side or at the picture's edge (door outside the picture): the door
                # camera decides whether it really left (ExitFusion).
                door_side = side((x, y), a, b) * self.out_side > 0
                at_edge = min(x, w - x) < 0.1 * w or min(y, h - y) < 0.1 * h
                if door_side or at_edge:
                    self.vanished.append((sid, tr.last_seen))
        for tr in touched:
            who = self._who.setdefault(tr.track_id, _Who())
            if who.start is None:
                who.start = tr.history[-1] if tr.history else None
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

    def __init__(self, report: Callable[[dict[str, object]], None], min_seen_s: float = 1.0,
                 on_leave: Callable[[float], None] | None = None, leaving_shrinks: bool = True) -> None:
        """leaving_shrinks: True when phone 1 looks along the corridor at people coming in (they grow as they come,
        someone walking out shrinks); False when it looks at the doorway from outside (the opposite)."""
        self._report, self.min_seen_s = report, min_seen_s
        self._on_leave, self.leaving_shrinks = on_leave, leaving_shrinks
        self._first_h: dict[int, float] = {}
        self.tracker: IouTracker | IdTracker = IouTracker(iou_min=0.2, max_missed=6, keep_embeddings=0)
        self._face_seen: dict[int, bool] = {}
        self.stats = {"bodies": 0, "no_face_entries": 0}

    def _leaving(self, h0: float, h1: float) -> bool:
        return h1 <= 0.7 * h0 if self.leaving_shrinks else h1 >= 1.4 * h0

    def reset(self) -> None:
        self.tracker.clear()
        self._face_seen.clear()
        self._first_h.clear()

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
                self._first_h[tr.track_id] = tr.box[3] - tr.box[1]
                self.stats["bodies"] += 1
            x1, y1, x2, y2 = tr.box
            if any(x1 <= (f.box[0] + f.box[2]) / 2 <= x2 and y1 <= (f.box[1] + f.box[3]) / 2 <= y2 for f in faces):
                self._face_seen[tr.track_id] = True
        for tr in ended:
            face_seen = self._face_seen.pop(tr.track_id, True)
            h0 = self._first_h.pop(tr.track_id, 0.0)
            long_enough = tr.last_seen - tr.first_seen >= self.min_seen_s
            if long_enough and h0 > 0 and self._leaving(h0, tr.box[3] - tr.box[1]):
                self.stats["leaving"] = self.stats.get("leaving", 0) + 1
                if self._on_leave:
                    self._on_leave(tr.last_seen)  # someone walked away from the door: not an entry
                continue
            if not face_seen and long_enough:
                self.stats["no_face_entries"] += 1
                self._report({"body_track_id": tr.track_id, "via": "body", "face": "not seen",
                              "seconds": round(tr.last_seen - tr.first_seen, 1)})

    def flush(self) -> None:
        """Decide bodies still in view (shutdown / session end)."""
        for tr in self.tracker.clear():
            if not self._face_seen.pop(tr.track_id, True) and tr.last_seen - tr.first_seen >= self.min_seen_s:
                self.stats["no_face_entries"] += 1
                self._report({"body_track_id": tr.track_id, "via": "body", "face": "not seen"})


class ExitFusion:
    """Two-camera exit: a named body lost near the door in the room + someone walking away at the door camera within
    `window_s` = that student left (works when the door is not in the room camera's picture)."""

    def __init__(self, report: Callable[[str, dict[str, object]], None], window_s: float = 10.0) -> None:
        self._report, self.window_s = report, window_s
        self._room: list[tuple[str, float]] = []
        self._door: list[float] = []
        self._lock = threading.Lock()

    def room_vanished(self, items: list[tuple[str, float]]) -> None:
        with self._lock:
            self._room.extend(items)
        self._match()

    def door_leaving(self, t: float) -> None:
        with self._lock:
            self._door.append(t)
        self._match()

    def _match(self) -> None:
        out: list[tuple[str, float]] = []
        with self._lock:
            for sid, tv in list(self._room):
                hit = next((td for td in self._door if abs(td - tv) <= self.window_s), None)
                if hit is not None:
                    self._room.remove((sid, tv))
                    self._door.remove(hit)
                    out.append((sid, tv))
            newest = max([t for _, t in self._room] + self._door, default=0.0)  # forget unmatched old ones
            self._room = [x for x in self._room if newest - x[1] <= 3 * self.window_s]
            self._door = [t for t in self._door if newest - t <= 3 * self.window_s]
        for sid, tv in out:
            self._report(sid, {"via": "two-camera", "room_lost_at": round(tv, 1)})
