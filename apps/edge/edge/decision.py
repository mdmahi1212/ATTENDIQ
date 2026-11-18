"""Gate decision rule (pure): votes over a track's best face crops, plus per-session dedupe."""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass

import numpy as np

from edge.gallery import Gallery, Match


@dataclass(frozen=True)
class Thresholds:
    accept: float = 0.45      # best cosine needed (buffalo_l; tune with scripts/face-eval.py)
    margin: float = 0.08      # best - second-best student
    min_votes: int = 2        # crops that must agree


@dataclass(frozen=True)
class Decision:
    student_id: str | None
    score: float
    margin: float
    votes: int
    crops: int

    @property
    def recognised(self) -> bool:
        return self.student_id is not None


def decide(embeddings: list[np.ndarray], gallery: Gallery, th: Thresholds) -> Decision:
    """Accept student X only if >= min_votes crops name X with score >= accept and margin >= margin."""
    matches: list[Match] = [gallery.match(e) for e in embeddings]
    good = [m for m in matches if m.student_id and m.score >= th.accept and m.margin >= th.margin]
    if not good:
        best = max(matches, key=lambda m: m.score, default=Match(None, 0.0, 0.0))
        return Decision(None, round(best.score, 4), round(best.margin, 4), 0, len(embeddings))
    votes = Counter(m.student_id for m in good)
    sid, n = votes.most_common(1)[0]
    mine = [m for m in good if m.student_id == sid]
    top = max(mine, key=lambda m: m.score)
    if n < th.min_votes or (len(votes) > 1 and votes.most_common(2)[1][1] == n):
        return Decision(None, round(top.score, 4), round(top.margin, 4), n, len(embeddings))
    return Decision(sid, round(top.score, 4), round(top.margin, 4), n, len(embeddings))


class SessionMemory:
    """Who is already marked in this session; a new IN after an OUT is a re-entry (reported again)."""

    def __init__(self) -> None:
        self.inside: set[str] = set()
        self.left: set[str] = set()

    def should_report_entry(self, student_id: str) -> bool:
        if student_id in self.inside:
            return False
        self.inside.add(student_id)
        self.left.discard(student_id)
        return True

    def exit(self, student_id: str) -> None:
        self.inside.discard(student_id)
        self.left.add(student_id)

    def clear(self) -> None:
        self.inside.clear()
        self.left.clear()
