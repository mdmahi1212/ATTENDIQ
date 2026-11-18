"""Loads a class script and expands it into time-ordered event envelopes."""

from __future__ import annotations

import random
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel, Field, field_validator

from attendiq_common.envelope import Envelope, EventType

MODEL_VERSION = "simulator@1"


def sim_student(n: int) -> uuid.UUID:
    return uuid.UUID(f"5a000000-0000-4000-8000-0000000000{n:02d}")


def parse_ids(spec: str) -> list[int]:
    out: list[int] = []
    for part in str(spec).split(","):
        a, _, b = part.strip().partition("-")
        lo, hi = int(a), int(b or a)
        if not (1 <= lo <= hi <= 30):
            raise ValueError(f"student ids must be within 01-30: {spec}")
        out.extend(range(lo, hi + 1))
    return out


class StudentGroup(BaseModel):
    ids: str
    arrive: float | list[float] | None = None  # minute, or [from, to] spread evenly
    leave: float | None = None
    reenter: float | None = None
    expect: str
    flags: list[str] = Field(default_factory=list)

    @field_validator("expect")
    @classmethod
    def _expect(cls, v: str) -> str:
        if v not in {"present", "late", "absent", "pending"}:
            raise ValueError(f"unknown expected status {v}")
        return v

    def arrival_times(self) -> list[float | None]:
        ids = parse_ids(self.ids)
        if self.arrive is None:
            return [None] * len(ids)
        if isinstance(self.arrive, list):
            lo, hi = self.arrive
            step = (hi - lo) / max(1, len(ids) - 1)
            return [round(lo + i * step, 2) for i in range(len(ids))]
        return [float(self.arrive)] * len(ids)


class Visitor(BaseModel):
    at: float


class Script(BaseModel):
    name: str
    minutes: int = 75
    occupancy_every_min: float = 1.0
    students: list[StudentGroup]
    visitors: list[Visitor] = Field(default_factory=list)
    duplicates: int = 0

    @property
    def last_minute(self) -> float:
        ts = [t for g in self.students for t in [*g.arrival_times(), g.leave, g.reenter] if t is not None]
        ts += [v.at for v in self.visitors]
        return max(ts, default=0.0)

    def expected(self) -> dict[uuid.UUID, dict[str, Any]]:
        out: dict[uuid.UUID, dict[str, Any]] = {}
        for g in self.students:
            for n in parse_ids(g.ids):
                sid = sim_student(n)
                if sid in out:
                    raise ValueError(f"student {n:02d} appears twice in the script")
                out[sid] = {"status": g.expect, "flags": sorted(g.flags)}
        return out


def load(path: str | Path) -> Script:
    return Script.model_validate(yaml.safe_load(Path(path).read_text(encoding="utf-8")))


def status_for(minute: float, present_until: int = 10, late_until: int = 30) -> str:
    """Mirror of public.status_for_time (used to sanity-check scripts)."""
    return "present" if minute <= present_until else "late" if minute <= late_until else "absent"


def build_events(script: Script, t0: datetime, device_id: uuid.UUID, session_id: uuid.UUID, seed: int = 7) -> list[Envelope]:
    rng = random.Random(seed)
    events: list[tuple[float, Envelope]] = []
    track = 0

    def ev(minute: float, et: EventType, payload: dict[str, Any]) -> None:
        jitter = rng.uniform(0, 0.4)  # seconds of jitter so events are not on exact minute boundaries
        at = t0 + timedelta(minutes=minute, seconds=jitter)
        events.append((minute, Envelope(event_type=et, source_device_id=device_id, session_id=session_id, observed_at=at,
                                        model_version=MODEL_VERSION, payload=payload, simulation=True)))

    def enter(minute: float, student: uuid.UUID) -> None:
        nonlocal track
        track += 1
        ev(minute, EventType.GATE_PERSON_IN, {"track_id": track})
        score = round(rng.uniform(0.55, 0.8), 3)
        margin = round(rng.uniform(0.15, 0.35), 3)
        ev(minute + 0.01, EventType.GATE_ENTRY_RECOGNISED,
           {"track_id": track, "student_id": str(student), "score": score, "margin": margin, "votes": 3})

    def leave(minute: float, student: uuid.UUID) -> None:
        nonlocal track
        track += 1
        ev(minute, EventType.GATE_PERSON_OUT, {"track_id": track, "student_id": str(student)})

    inside: dict[float, int] = {}
    for g in script.students:
        for n, arrive in zip(parse_ids(g.ids), g.arrival_times(), strict=True):
            sid = sim_student(n)
            if arrive is None:
                continue
            enter(arrive, sid)
            inside[arrive] = inside.get(arrive, 0) + 1
            if g.leave is not None:
                leave(g.leave, sid)
                inside[g.leave] = inside.get(g.leave, 0) - 1
            if g.reenter is not None:
                enter(g.reenter, sid)
                inside[g.reenter] = inside.get(g.reenter, 0) + 1
    for v in script.visitors:
        track += 1
        ev(v.at, EventType.GATE_PERSON_IN, {"track_id": track})
        ev(v.at + 0.01, EventType.GATE_ENTRY_UNKNOWN, {"track_id": track, "score": round(rng.uniform(0.2, 0.35), 3), "votes": 3})
        inside[v.at] = inside.get(v.at, 0) + 1

    # Occupancy: people inside (students + visitors) + 1 professor, sampled every N minutes.
    m, count = 0.0, 0
    changes = sorted(inside.items())
    while m <= script.last_minute + script.occupancy_every_min:
        count = 1 + sum(d for t, d in changes if t <= m)
        ev(m, EventType.OCCUPANCY_UPDATED, {"raw": count, "smoothed": count, "stable": True})
        m += script.occupancy_every_min

    ordered = [e for _, e in sorted(events, key=lambda x: (x[1].observed_at, x[0]))]
    gate = [e for e in ordered if e.event_type == EventType.GATE_ENTRY_RECOGNISED]
    for e in rng.sample(gate, min(script.duplicates, len(gate))):
        ordered.append(e)  # identical event_id: the server must ignore it
    return ordered
