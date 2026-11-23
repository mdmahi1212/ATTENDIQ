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


# ---------------------------------------------------------------- body ids from BoT-SORT + ReID
def test_identity_follows_the_tracker_id_when_two_people_cross() -> None:
    tr, reports, _ = make()
    # two seated students: A at x=500 (id 7), B at x=300 (id 8); faces seen while sitting
    for k in range(3):
        t = k * 0.2
        tr.faces([FaceDet((475, 120, 525, 180), 0.9, near(A, 0.8, 20 + k)),
                  FaceDet((275, 120, 325, 180), 0.9, near(B, 0.8, 30 + k))], t)
        tr.update([body(500), body(300)], W, H, t, ids=[7, 8])
    # A walks to the door, passing right through B's box; ReID keeps A's id = 7 the whole way
    for k, x in enumerate(range(460, 90, -40)):
        tr.update([body(x), body(300)], W, H, 1.0 + k * 0.2, ids=[7, 8])
    assert [sid for sid, _ in reports] == ["stu-a"]


def test_id_tracker_ends_tracks_that_disappear() -> None:
    from edge.tracker import IdTracker

    it = IdTracker(max_missed=2)
    touched, ended = it.update([((0, 0, 10, 10), 5), ((50, 0, 60, 10), None)], 0.0)
    assert [t.track_id for t in touched] == [5] and ended == []
    for k in range(3):
        _, ended = it.update([], 0.1 * (k + 1))
    assert [t.track_id for t in ended] == [5]


# ---------------------------------------------------------------- two-camera exit + leaving at the door
def test_door_body_walking_away_is_leaving_not_an_unknown_entry() -> None:
    from edge.bodyexit import DoorBodyWatcher

    reports: list[dict] = []
    left: list[float] = []
    w = DoorBodyWatcher(reports.append, min_seen_s=1.0, on_leave=left.append)
    for k, hgt in enumerate([300, 280, 250, 220, 190, 170, 150]):  # shrinking: walking away down the corridor
        w.update([(300, 100, 380, 100 + hgt)], [], k * 0.2)
    for k in range(8):
        w.update([], [], 1.4 + k * 0.2)
    assert reports == [] and len(left) == 1


def test_named_body_lost_at_the_door_side_plus_door_leaving_is_reported_out() -> None:
    from edge.bodyexit import ExitFusion

    tr, reports, _ = make()
    walk(tr, [500, 500, 500], face_emb=near(B, 0.8, 7))  # B sits, face seen
    for k, x in enumerate([530, 560, 590, 615]):  # walks out of the picture on the right (door outside the picture)
        tr.update([body(x)], W, H, 0.6 + k * 0.2)
    for k in range(8):  # gone
        tr.update([], W, H, 1.4 + k * 0.2)
    lost = tr.vanished
    out: list[tuple[str, dict]] = []
    f = ExitFusion(lambda sid, p: out.append((sid, p)))
    f.room_vanished(lost)
    assert out == []  # the door camera has not seen anyone go yet
    f.door_leaving(lost[0][1] + 4.0)
    assert [sid for sid, _ in out] == ["stu-b"] and out[0][1]["via"] == "two-camera"


def test_lost_body_without_anyone_leaving_at_the_door_is_ignored() -> None:
    from edge.bodyexit import ExitFusion

    out: list[tuple[str, dict]] = []
    f = ExitFusion(lambda sid, p: out.append((sid, p)))
    f.room_vanished([("stu-a", 10.0)])
    f.door_leaving(40.0)  # much later: someone else
    assert out == []


def test_named_body_walking_out_of_the_bottom_of_the_picture_is_reported() -> None:
    # Door behind the camera: exit line drawn along the bottom edge; leavers vanish there before "crossing" it.
    g = Gallery()
    g.load(GALLERY)
    reports: list[tuple[str | None, dict]] = []
    tr = BodyExitTracker((0.0, 0.99), (1.0, 0.99), -1, g, SessionMemory(), Thresholds(), lambda s, p: reports.append((s, p)))
    seat = (300, 150, 380, 330)  # sitting in the middle of the room
    for k in range(3):
        tr.faces([FaceDet((320, 160, 360, 200), 0.9, near(A, 0.8, 50 + k))], k * 0.2)
        tr.update([seat], W, H, k * 0.2)
    for k, y in enumerate(range(360, 480, 20)):  # walks toward the camera, box bottom reaches the picture's edge
        tr.update([(290, y - 220, 390, min(y, 479))], W, H, 1.0 + k * 0.2)
    for k in range(8):  # gone (out of the picture, under the camera)
        tr.update([], W, H, 2.4 + k * 0.2)
    assert [sid for sid, _ in reports] == ["stu-a"]


def test_a_seated_student_lost_in_the_middle_is_not_reported() -> None:
    g = Gallery()
    g.load(GALLERY)
    reports: list[tuple[str | None, dict]] = []
    tr = BodyExitTracker((0.0, 0.99), (1.0, 0.99), -1, g, SessionMemory(), Thresholds(), lambda s, p: reports.append((s, p)))
    for k in range(3):
        tr.faces([FaceDet((320, 160, 360, 200), 0.9, near(A, 0.8, 60 + k))], k * 0.2)
        tr.update([(300, 150, 380, 330)], W, H, k * 0.2)
    for k in range(8):  # hidden behind someone, far from the line
        tr.update([], W, H, 0.6 + k * 0.2)
    assert reports == []


def _edge_tracker(reports: list) -> BodyExitTracker:  # noqa: ANN001
    g = Gallery()
    g.load(GALLERY)
    tr = BodyExitTracker((0.0, 0.99), (1.0, 0.99), -1, g, SessionMemory(), Thresholds(), lambda s, p: reports.append((s, p)))
    tr.edge_mode = True  # exit line drawn on the picture's edge: the door is outside the picture
    return tr


def test_edge_mode_settled_student_walking_out_the_left_edge_left() -> None:
    reports: list = []
    tr = _edge_tracker(reports)
    for k in range(80):  # sits mid-room for 16 s, face seen
        if k < 3:
            tr.faces([FaceDet((320, 160, 360, 200), 0.9, near(A, 0.8, 70 + k))], k * 0.2)
        tr.update([(300, 150, 380, 330)], W, H, k * 0.2, ids=[9])
    for k, x in enumerate(range(260, 0, -60)):  # gets up, walks out of the picture on the left
        tr.update([(max(0, x - 40), 140, x + 40, 400)], W, H, 16.0 + k * 0.2, ids=[9])
    for k in range(8):
        tr.update([], W, H, 17.0 + k * 0.2, ids=[])
    assert [sid for sid, _ in reports] == ["stu-a"]


def test_edge_mode_someone_arriving_through_the_bottom_is_not_leaving() -> None:
    reports: list = []
    tr = _edge_tracker(reports)
    for k in range(3):
        tr.faces([FaceDet((320, 300, 360, 340), 0.9, near(A, 0.8, 80 + k))], k * 0.2)
    for k, y in enumerate(range(479, 300, -30)):  # walks in from the bottom ...
        tr.update([(300, y - 250, 380, y)], W, H, k * 0.2, ids=[4])
    for k, y in enumerate(range(330, 479, 30)):  # ... changes their mind after a few seconds and walks back out
        tr.update([(300, y - 250, 380, min(y, 479))], W, H, 2.0 + k * 0.2, ids=[4])
    for k in range(8):
        tr.update([], W, H, 4.0 + k * 0.2, ids=[])
    assert reports == []  # never settled in the room: not a "left the class"


def test_neighbours_face_does_not_name_the_wrong_body() -> None:
    # Two students seated close: body boxes overlap. A's head is over body 1, B's over body 2; B's face also falls
    # inside body 1's (wide) box. B must not name body 1.
    g = Gallery()
    g.load(GALLERY)
    tr = BodyExitTracker((0.3, 0.0), (0.3, 1.0), 1, g, SessionMemory(), Thresholds(), lambda s, p: None)
    b1, b2 = (200, 100, 360, 400), (300, 110, 420, 400)  # overlap 300-360
    for k in range(6):
        t = k * 0.2
        tr.faces([FaceDet((255, 110, 295, 150), 0.9, near(A, 0.8, 90 + k)),  # A: over the middle of body 1
                  FaceDet((340, 120, 380, 160), 0.9, near(B, 0.8, 100 + k))], t)  # B: over body 2 (and inside body 1)
        tr.update([b1, b2], W, H, t, ids=[1, 2])
    assert tr.identity(1) == "stu-a" and tr.identity(2) == "stu-b"


def test_a_body_with_two_names_close_together_gets_no_name() -> None:
    from edge.bodyexit import _Who

    who = _Who()
    who.votes.update({"stu-a": 3, "stu-b": 2})
    assert BodyExitTracker._identity(who) is None  # not sure -> nobody is blamed
    who.votes.update({"stu-a": 3})
    assert BodyExitTracker._identity(who) == "stu-a"  # 6 vs 2: clear
