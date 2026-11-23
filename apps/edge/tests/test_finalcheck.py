from conftest import near, unit

from edge.decision import Thresholds
from edge.finalcheck import FinalCheck
from edge.gallery import Gallery
from edge.gate import FaceDet

A, B, C, X = unit(1), unit(2), unit(3), unit(99)
GALLERY = {"students": [{"id": s, "name_initials": s[-1].upper(), "embeddings": [e.tolist()]}
                        for s, e in (("stu-a", A), ("stu-b", B), ("stu-c", C))]}


def test_final_check_uses_many_frames_faces_and_body_names() -> None:
    g = Gallery()
    g.load(GALLERY)
    out: list[dict] = []
    fc = FinalCheck(g, Thresholds(), out.append, window_s=30)
    fc.start(0.0)
    for k in range(150):  # 30 s at 5 fps
        t = k * 0.2
        seated = 3 if k % 10 else 1  # one frame in ten misses two people (occlusion): the median ignores it
        fc.bodies(seated, ["stu-c", None], t)  # stu-c: looking down the whole time, known from earlier by body
        if k % 15 == 0:
            fc.faces([FaceDet((0, 0, 80, 80), 0.9, near(A, 0.8, 200 + k)),  # stu-a: face seen many times
                      FaceDet((100, 0, 180, 80), 0.9, X)], t)  # a stranger
        if k == 40:
            fc.faces([FaceDet((200, 0, 280, 80), 0.9, near(B, 0.8, 7))], t)  # stu-b: one glimpse only
    fc.bodies(3, [], 30.2)
    assert len(out) == 1
    r = out[0]
    assert r["count"] == 3 and r["count_max"] == 3
    assert r["students"] == ["stu-a", "stu-c"]  # one glimpse of stu-b is not enough
    assert r["unknown_faces"] >= 1 and r["frames"] >= 150 and r["window_s"] >= 30
    assert not fc.running


def test_nothing_is_collected_unless_a_check_is_running() -> None:
    out: list[dict] = []
    fc = FinalCheck(Gallery(), Thresholds(), out.append)
    fc.bodies(5, ["stu-a"], 100.0)
    fc.faces([], 100.0)
    assert out == [] and not fc.running
