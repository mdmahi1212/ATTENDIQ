"""Session gallery in RAM: students enrolled in the section with an ACTIVE face profile. Wiped on stop."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np


@dataclass(frozen=True)
class Match:
    student_id: str | None
    score: float
    second: float  # best score of a DIFFERENT student

    @property
    def margin(self) -> float:
        return self.score - self.second


class Gallery:
    def __init__(self) -> None:
        self._m = np.zeros((0, 512), dtype=np.float32)
        self._owner: list[str] = []
        self.students: dict[str, str] = {}  # id -> initials

    def __len__(self) -> int:
        return len(self.students)

    def load(self, data: dict[str, Any]) -> None:
        rows: list[np.ndarray] = []
        owners: list[str] = []
        students: dict[str, str] = {}
        for s in data.get("students", []):
            sid = str(s["id"])
            students[sid] = str(s.get("name_initials") or "")
            for e in s.get("embeddings") or []:
                v = np.asarray(e, dtype=np.float32)
                n = float(np.linalg.norm(v))
                if v.shape == (512,) and n > 0:
                    rows.append(v / n)
                    owners.append(sid)
        self._m = np.vstack(rows) if rows else np.zeros((0, 512), dtype=np.float32)
        self._owner = owners
        self.students = students

    def clear(self) -> None:
        self._m = np.zeros((0, 512), dtype=np.float32)
        self._owner = []
        self.students = {}

    def match(self, emb: np.ndarray) -> Match:
        """Cosine = matrix @ unit vector; per student the max over their embeddings."""
        if not self._owner:
            return Match(None, 0.0, 0.0)
        v = emb.astype(np.float32)
        if not np.isfinite(v).all():  # a broken crop must never crash the camera loop
            return Match(None, 0.0, 0.0)
        v = v / (float(np.linalg.norm(v)) or 1.0)
        sims = self._m @ v
        best: dict[str, float] = {}
        for owner, s in zip(self._owner, sims.tolist(), strict=True):
            if s > best.get(owner, -1.0):
                best[owner] = s
        ranked = sorted(best.items(), key=lambda kv: -kv[1])
        second = ranked[1][1] if len(ranked) > 1 else 0.0
        return Match(ranked[0][0], float(ranked[0][1]), float(second))
