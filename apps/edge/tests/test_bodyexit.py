"""Exit by body: identity carried from the face to the body, OUT reported when the body crosses the exit line."""

import uuid
from datetime import UTC, datetime

from conftest import near, unit

from attendiq_common.envelope import Envelope
from edge.bodyexit import BodyExitTracker
from edge.decision import SessionMemory, Thresholds
from edge.gallery import Gallery
from edge.gate import FaceDet, GatePipeline

A, B = unit(1), unit(2)
GALLERY = {"students": [{"id": "stu-a", "name_initials": "AA", "embeddings": [A.tolist()]},
                        {"id": "stu-b", "name_initials": "BB", "embeddings": [B.tolist()]}]}
W, H = 640, 480  # door on the LEFT; exit line at x = 0.3 (192 px); going left of it = OUT


def make() -> tuple[BodyExitTracker, list[tuple[str | None, dict]], SessionMemory]:
    g = Gallery()
    g.load(GALLERY)
    mem = SessionMemory()
    reports: list[tuple[str | None, dict]] = []
    tr = BodyExitTracker((0.3, 0.0), (0.3, 1.0), 1, g, mem, Thresholds(), lambda sid, p: reports.append((sid, p)))
    return tr, reports, mem


def body(x: float) -> tuple[float, float, float, float]:
    return (x - 50, 100, x + 50, 400)  # 100 x 300 px person, face area y 100-250


def walk(tr: BodyExitTracker, xs: list[float], face_emb=None, t0: float = 0.0) -> None:  # noqa: ANN001
    for i, x in enumerate(xs):
        t = t0 + i * 0.2
        if face_emb is not None:
            tr.faces([FaceDet((x - 25, 120, x + 25, 180), 0.9, face_emb)], t)
        tr.update([body(x)], W, H, t)


def test_face_seen_in_class_then_back_turned_at_the_door_is_reported_as_that_student() -> None:
    tr, reports, _ = make()
    walk(tr, [500, 500, 500], face_emb=near(B, 0.8, 7))  # sitting, face visible: identity learned
    walk(tr, list(range(460, 90, -40)), t0=0.6)  # walks to the door, face turned away
    assert [sid for sid, _ in reports] == ["stu-b"]
    assert reports[0][1]["via"] == "body"


def test_never_seen_face_is_reported_as_someone_left() -> None:
    tr, reports, _ = make()
    walk(tr, list(range(500, 90, -40)))
    assert [sid for sid, _ in reports] == [None]
    assert tr.stats["out_unknown"] == 1


def test_seated_people_and_people_coming_in_are_not_reported() -> None:
    tr, reports, _ = make()
    walk(tr, [500, 505, 498, 502, 500], face_emb=near(A, 0.8, 3))
    walk(tr, list(range(100, 400, 40)), t0=5.0)  # walks INTO the room (away from the door)
    assert reports == []


def test_student_already_reported_by_the_face_camera_is_not_reported_twice() -> None:
    tr, reports, mem = make()
    walk(tr, [500, 500, 500], face_emb=near(A, 0.8, 4))
    mem.exit("stu-a")  # the face pipeline saw stu-a leave first
    walk(tr, list(range(460, 90, -40)), t0=0.6)
    assert reports == [] and tr.stats["skipped_already_out"] == 1


def test_one_face_frame_is_not_enough_to_name_a_body() -> None:
    tr, reports, _ = make()
    walk(tr, [500], face_emb=near(B, 0.8, 9))  # a single glimpse
    walk(tr, list(range(460, 90, -40)), t0=0.2)
    assert [sid for sid, _ in reports] == [None]


def test_gate_dedupes_an_unknown_body_out_right_after_a_face_out() -> None:
    events: list[Envelope] = []
    from edge.gate import GateConfig

    pipe = GatePipeline(GateConfig(), Gallery(), uuid.UUID(int=1), events.append, None,
                        clock=lambda: datetime(2026, 11, 23, tzinfo=UTC))
    pipe.start(uuid.uuid4(), GALLERY)
    assert pipe.report_out("stu-a", {"track_id": 1}, t=10.0)
    assert not pipe.report_out(None, {"via": "body"}, t=11.0)  # same person seen by the body tracker
    assert pipe.report_out(None, {"via": "body"}, t=20.0)  # someone else, later
    assert [e.payload.get("student_id") for e in events] == ["stu-a", None]


# ---------------------------------------------------------------- door camera: bodies + faces
def door_walk(w, xs: list[float], with_face: bool, t0: float = 0.0) -> None:  # noqa: ANN001
    for i, x in enumerate(xs):
        faces = [FaceDet((x - 25, 120, x + 25, 180), 0.9, None)] if with_face else []
        w.update([body(x)], faces, t0 + i * 0.2)
    for k in range(8):  # gone from the picture -> track ends
        w.update([], [], t0 + (len(xs) + k) * 0.2)


def test_door_reports_a_person_whose_face_never_showed() -> None:
    from edge.bodyexit import DoorBodyWatcher

    reports: list[dict] = []
    w = DoorBodyWatcher(reports.append, min_seen_s=1.0)
    door_walk(w, list(range(100, 400, 40)), with_face=False)  # head down for the whole walk
    assert len(reports) == 1 and reports[0]["face"] == "not seen"


def test_door_leaves_people_with_a_face_to_the_face_pipeline_and_ignores_glimpses() -> None:
    from edge.bodyexit import DoorBodyWatcher

    reports: list[dict] = []
    w = DoorBodyWatcher(reports.append, min_seen_s=1.0)
    door_walk(w, list(range(100, 400, 40)), with_face=True)  # face found -> recognised or unknown by face
    door_walk(w, [300, 320], with_face=False, t0=10.0)  # 0.4 s in view: too short to count
    assert reports == []


def test_gate_reports_unknown_entry_with_red_led() -> None:
    from edge.gate import GateConfig

    events: list[Envelope] = []
    fb: list[str] = []
    pipe = GatePipeline(GateConfig(), Gallery(), uuid.UUID(int=1), events.append, fb.append,
                        clock=lambda: datetime(2026, 11, 23, tzinfo=UTC))
    pipe.report_unknown_entry({"via": "body"})  # no class running: ignored
    pipe.start(uuid.uuid4(), GALLERY)
    pipe.report_unknown_entry({"via": "body", "face": "not seen"})
    assert [e.event_type.value for e in events] == ["GATE_ENTRY_UNKNOWN"] and fb == ["unknown"]
