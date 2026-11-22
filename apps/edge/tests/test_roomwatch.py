from conftest import near, unit

from edge.decision import Thresholds
from edge.gallery import Gallery
from edge.gate import FaceDet
from edge.roomwatch import RoomWatcher

A, B, X = unit(1), unit(2), unit(99)
GALLERY = {"students": [{"id": "stu-a", "name_initials": "AA", "embeddings": [A.tolist()]},
                        {"id": "stu-b", "name_initials": "BB", "embeddings": [B.tolist()]}]}


def make() -> tuple[RoomWatcher, list[str], list[float]]:
    g = Gallery()
    g.load(GALLERY)
    seen: list[str] = []
    unknown: list[float] = []
    return RoomWatcher(g, Thresholds(), seen.append, unknown.append), seen, unknown


def face(emb, w: float = 80) -> FaceDet:  # noqa: ANN001
    return FaceDet((100, 100, 100 + w, 180), 0.9, emb)


def test_enrolled_student_reported_once_a_minute() -> None:
    w, seen, unknown = make()
    for k in range(40):  # 80 s of frames
        w.update([face(near(A, 0.8, 100 + k))], k * 2.0)
    assert seen == ["stu-a", "stu-a"] and unknown == []


def test_a_stranger_sitting_in_triggers_one_alert_and_glimpses_do_not() -> None:
    w, seen, unknown = make()
    w.update([face(X)], 0.0)  # one glimpse
    w.update([face(X)], 30.0)
    assert unknown == []
    for k in range(10):  # sits there for 10 s
        w.update([face(X)], 40.0 + k)
    assert len(unknown) == 1 and unknown[0] < 0.3
    for k in range(10):  # still there: no second alert within 2 minutes
        w.update([face(X)], 60.0 + k)
    assert len(unknown) == 1 and seen == []


def test_small_or_blurry_faces_are_ignored() -> None:
    w, seen, unknown = make()
    for k in range(10):
        w.update([face(X, w=30), FaceDet((0, 0, 90, 90), 0.9, None)], float(k))
    assert seen == [] and unknown == []


def test_a_broken_embedding_is_ignored() -> None:
    w, seen, unknown = make()
    w.update([face(near(A, 0.8, 1))], 0.0)  # seed 1 = A itself -> NaN vector
    assert seen == [] and unknown == []
