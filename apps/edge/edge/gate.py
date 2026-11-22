"""Gate pipeline: detections -> tracks -> line crossing -> votes -> envelopes (pure apart from the injected detector)."""

from __future__ import annotations

import logging
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Protocol

import numpy as np

from attendiq_common.envelope import Envelope, EventType
from edge.decision import Decision, SessionMemory, Thresholds, decide
from edge.gallery import Gallery
from edge.geometry import Box, Point, crossing
from edge.tracker import IouTracker, Track

log = logging.getLogger("edge.gate")


@dataclass(frozen=True)
class FaceDet:
    box: Box
    det_score: float
    embedding: np.ndarray | None  # unit vector, None when the crop failed the quality gates


class Detector(Protocol):
    def __call__(self, frame: np.ndarray) -> list[FaceDet]: ...


@dataclass(frozen=True)
class GateConfig:
    # Entry line in NORMALISED coords (0..1) of the gate frame. in_side = +1: crossing to BELOW a
    # left-to-right line means IN (toward the room); -1: crossing to ABOVE it means IN.
    line_a: Point = (0.0, 0.55)
    line_b: Point = (1.0, 0.55)
    in_side: int = 1
    # "line": IN = crossing the line toward the room (spec). "presence": any recognised face that stays
    # >= presence_min_s counts as IN (for a phone pointed only at people walking IN).
    entry_mode: str = "line"
    presence_min_s: float = 0.6
    # False = exit-only camera (inside, beside the door, looking into the room): crossings toward the room
    # are ignored because this camera sees entering people from behind; only OUT crossings are reported.
    count_in: bool = True
    min_travel_px: float = 25.0
    min_face_px: int = 60
    min_det_score: float = 0.6
    thresholds: Thresholds = Thresholds()
    model_version: str = "buffalo_l / thr-0.45"


class GatePipeline:
    def __init__(self, cfg: GateConfig, gallery: Gallery, device_id: uuid.UUID,
                 emit: Callable[[Envelope], None], feedback: Callable[[str], None] | None = None,
                 clock: Callable[[], datetime] = lambda: datetime.now(UTC),
                 memory: SessionMemory | None = None) -> None:
        self.cfg, self.gallery, self.device_id = cfg, gallery, device_id
        self._emit, self._feedback, self._clock = emit, feedback, clock
        self.tracker = IouTracker(keep_embeddings=5)
        # Shared between the entry and the exit pipeline: an OUT seen by the exit camera makes the next
        # entry at the door a reported re-entry.
        self.memory = memory if memory is not None else SessionMemory()
        self.session_id: uuid.UUID | None = None
        self.simulation = False
        self.stats = {"frames": 0, "faces": 0, "in": 0, "out": 0, "recognised": 0, "unknown": 0}

    # ------------------------------------------------------------ session control
    def start(self, session_id: uuid.UUID, gallery_data: dict[str, Any]) -> None:
        self.session_id = session_id
        self.gallery.load(gallery_data)
        self.tracker.clear()
        self.memory.clear()
        log.info("session %s started, gallery %d students", session_id, len(self.gallery))

    def reload_gallery(self, gallery_data: dict[str, Any]) -> None:
        """New/changed enrollments mid-session: swap the faces only; keep tracks and who is already marked."""
        self.gallery.load(gallery_data)

    def stop(self) -> None:
        self.session_id = None
        self.gallery.clear()  # biometric data only lives in RAM during a session
        self.tracker.clear()
        self.memory.clear()

    # ------------------------------------------------------------ frames
    def process(self, faces: list[FaceDet], frame_w: int, frame_h: int, t: float) -> None:
        self.stats["frames"] += 1
        if self.session_id is None:
            return
        dets = []
        for f in faces:
            w = f.box[2] - f.box[0]
            ok = w >= self.cfg.min_face_px and f.det_score >= self.cfg.min_det_score
            dets.append((f.box, f.det_score, f.embedding if ok else None))
        self.stats["faces"] += len(faces)
        touched, ended = self.tracker.update(dets, t)
        a = (self.cfg.line_a[0] * frame_w, self.cfg.line_a[1] * frame_h)
        b = (self.cfg.line_b[0] * frame_w, self.cfg.line_b[1] * frame_h)
        for tr in touched:
            if tr.direction is None and self.cfg.entry_mode == "line":
                d = crossing(tr.history, a, b, self.cfg.in_side, self.cfg.min_travel_px)
                if d == "in" and not self.cfg.count_in:
                    tr.direction = "ignored"
                elif d:
                    tr.direction = d
                    self._on_cross(tr)
            seen_long = tr.last_seen - tr.first_seen >= self.cfg.presence_min_s
            if self.cfg.entry_mode == "presence" and tr.direction is None and seen_long:
                if len(tr.embeddings) >= self.cfg.thresholds.min_votes:
                    # Entry camera: any face seen long enough walked IN. Exit-only camera: it walked OUT.
                    tr.direction = "in" if self.cfg.count_in else "out"
                    self._on_cross(tr)
            if tr.direction == "in" and not tr.decided and len(tr.embeddings) >= self.cfg.thresholds.min_votes + 1:
                self._decide(tr)  # enough crops: decide early (lower latency)
        for tr in ended:
            if tr.direction == "in" and not tr.decided:
                self._decide(tr)

    def _on_cross(self, tr: Track) -> None:
        if tr.direction == "in":
            self.stats["in"] += 1
            self._event(EventType.GATE_PERSON_IN, {"track_id": tr.track_id})
        else:
            self.stats["out"] += 1
            d = decide([e for _, e in tr.embeddings], self.gallery, self.cfg.thresholds) if tr.embeddings else None
            payload: dict[str, Any] = {"track_id": tr.track_id}
            if d and d.recognised:
                payload["student_id"] = d.student_id
                self.memory.exit(d.student_id)  # type: ignore[arg-type]
            self._event(EventType.GATE_PERSON_OUT, payload)
            if self._feedback:
                self._feedback("left")

    def _decide(self, tr: Track) -> Decision:
        tr.decided = True
        d = decide([e for _, e in tr.embeddings], self.gallery, self.cfg.thresholds)
        payload = {"track_id": tr.track_id, "score": d.score, "margin": d.margin, "votes": d.votes, "crops": d.crops}
        if d.recognised and d.student_id:
            tr.student_id = d.student_id
            if self.memory.should_report_entry(d.student_id):
                self.stats["recognised"] += 1
                self._event(EventType.GATE_ENTRY_RECOGNISED, {**payload, "student_id": d.student_id})
            if self._feedback:
                self._feedback("ok")
        else:
            self.stats["unknown"] += 1
            self._event(EventType.GATE_ENTRY_UNKNOWN, payload)
            if self._feedback:
                self._feedback("unknown")
        return d

    def _event(self, et: EventType, payload: dict[str, Any]) -> None:
        self._emit(Envelope(event_type=et, source_device_id=self.device_id, session_id=self.session_id,
                            observed_at=self._clock(), model_version=self.cfg.model_version, payload=payload,
                            simulation=self.simulation))
