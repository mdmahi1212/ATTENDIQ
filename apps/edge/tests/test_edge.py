import uuid
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
from conftest import near, unit

from attendiq_common.envelope import Envelope, EventType
from edge.camera import Backoff, Camera
from edge.decision import SessionMemory, Thresholds, decide
from edge.gallery import Gallery
from edge.gate import FaceDet, GateConfig, GatePipeline
from edge.geometry import crossing, iou
from edge.outbox import Outbox, Publisher
from edge.tracker import IouTracker

A, B = unit(1), unit(2)
GALLERY = {"students": [{"id": "stu-a", "name_initials": "AA", "embeddings": [A.tolist(), near(A, 0.9, 5).tolist()]},
                        {"id": "stu-b", "name_initials": "BB", "embeddings": [B.tolist()]}]}
DEV = uuid.UUID("e0000000-0000-4000-8000-000000000001")


def gallery() -> Gallery:
    g = Gallery()
    g.load(GALLERY)
    return g


# ---------------------------------------------------------------- geometry / tracking
def test_iou() -> None:
    assert iou((0, 0, 10, 10), (0, 0, 10, 10)) == 1
    assert iou((0, 0, 10, 10), (20, 20, 30, 30)) == 0
    assert round(iou((0, 0, 10, 10), (5, 0, 15, 10)), 3) == 0.333


def test_line_crossing_direction() -> None:
    a, b = (0.0, 50.0), (100.0, 50.0)  # horizontal line, left->right; image y grows downward
    assert crossing([(50, 20), (50, 40), (50, 70)], a, b, in_side=1) == "in"  # moved down across it
    assert crossing([(50, 80), (50, 30)], a, b, in_side=1) == "out"
    assert crossing([(50, 20), (50, 45)], a, b, in_side=1) is None  # never crossed
    assert crossing([(50, 49), (50, 51)], a, b, in_side=1, min_travel=25) is None  # jitter on the line
    assert crossing([(50, 20), (50, 70)], a, b, in_side=-1) == "out"  # room on the other side


def test_tracker_keeps_ids_and_ends_lost_tracks() -> None:
    t = IouTracker(max_missed=2)
    touched, _ = t.update([((0, 0, 10, 10), 0.9, None), ((50, 50, 60, 60), 0.9, None)], 0)
    ids = sorted(tr.track_id for tr in touched)
    touched, _ = t.update([((1, 1, 11, 11), 0.9, None)], 1)
    assert touched[0].track_id == ids[0]
    ended: list = []
    for k in range(3):
        _, e = t.update([((1, 1, 11, 11), 0.9, None)], 2 + k)
        ended += e
    assert [tr.track_id for tr in ended] == [ids[1]]


# ---------------------------------------------------------------- decision rule
TH = Thresholds(accept=0.45, margin=0.08, min_votes=2)


def test_accepts_with_enough_agreeing_votes() -> None:
    d = decide([near(A, 0.7, 10), near(A, 0.65, 11), near(A, 0.6, 12)], gallery(), TH)
    assert d.student_id == "stu-a" and d.votes == 3 and d.score >= 0.69


def test_one_good_crop_is_not_enough() -> None:
    d = decide([near(A, 0.7, 10), unit(30)], gallery(), TH)
    assert d.student_id is None and d.votes == 1


def test_below_threshold_is_unknown() -> None:
    assert decide([near(A, 0.35, 10), near(A, 0.3, 11)], gallery(), TH).student_id is None


def test_ambiguous_between_two_students_is_unknown() -> None:
    mix = (A + B) / np.linalg.norm(A + B)  # equally close to both -> margin ~0
    assert decide([mix, mix], gallery(), TH).student_id is None


def test_tied_votes_are_unknown() -> None:
    d = decide([near(A, 0.7, 10), near(A, 0.7, 11), near(B, 0.7, 12), near(B, 0.7, 13)], gallery(), TH)
    assert d.student_id is None


def test_session_memory_dedupes_and_allows_reentry() -> None:
    m = SessionMemory()
    assert m.should_report_entry("x") and not m.should_report_entry("x")
    m.exit("x")
    assert m.should_report_entry("x")


def test_gallery_wipe() -> None:
    g = gallery()
    assert len(g) == 2
    g.clear()
    assert len(g) == 0 and g.match(A).student_id is None


# ---------------------------------------------------------------- outbox
def env() -> Envelope:
    return Envelope(event_type=EventType.GATE_PERSON_IN, source_device_id=DEV, session_id=uuid.uuid4(), payload={"track_id": 1})


def test_outbox_offline_then_replay_keeps_observed_at() -> None:
    ob = Outbox(":memory:")
    sent: list[tuple[str, str]] = []
    online = {"v": False}
    mid = {"n": 0}

    def send(topic: str, body: str) -> int | None:
        if not online["v"]:
            return None
        mid["n"] += 1
        sent.append((topic, body))
        return mid["n"]

    p = Publisher(ob, send)
    e1, e2 = env(), env()
    p.publish("t", e1)
    p.publish("t", e2)
    assert sent == [] and ob.pending_count() == 2
    online["v"] = True
    assert p.replay() == 2
    def ms(d: datetime) -> datetime:
        return d.replace(microsecond=d.microsecond // 1000 * 1000)

    assert [Envelope.from_json(b).observed_at for _, b in sent] == [ms(e1.observed_at), ms(e2.observed_at)]
    p.on_puback(1)
    p.on_puback(2)
    assert ob.pending_count() == 0


def test_outbox_is_idempotent_and_unacked_messages_are_resent() -> None:
    ob = Outbox(":memory:")
    sent: list[str] = []
    p = Publisher(ob, lambda t, b: (sent.append(b), len(sent))[1])
    e = env()
    p.publish("t", e)
    p.publish("t", e)  # same event_id: stored and sent once
    assert len(sent) == 1
    p.replay()  # no PUBACK yet (e.g. broker restart): sent again
    assert len(sent) == 2 and ob.pending_count() == 1
    p.on_puback(2)
    assert ob.pending_count() == 0


def test_outbox_survives_restart(tmp_path) -> None:  # noqa: ANN001
    path = tmp_path / "ob.db"
    Publisher(Outbox(path), lambda t, b: None).publish("t", env())
    assert Outbox(path).pending_count() == 1


# ---------------------------------------------------------------- camera
class FakeCap:
    def __init__(self, frames: int, opened: bool = True) -> None:
        self.frames, self.opened = frames, opened

    def isOpened(self) -> bool:  # noqa: N802
        return self.opened

    def read(self):  # noqa: ANN201
        if self.frames <= 0:
            return False, None
        self.frames -= 1
        return True, np.zeros((4, 4, 3), np.uint8)

    def release(self) -> None:
        pass

    def get(self, _p: int) -> float:
        return 0.0


def test_backoff_doubles_and_caps() -> None:
    b = Backoff(1, 8)
    assert [b.next() for _ in range(5)] == [1, 2, 4, 8, 8]
    b.reset()
    assert b.next() == 1


def test_camera_reports_offline_then_online_and_reconnects() -> None:
    import threading

    caps = [FakeCap(0, opened=False), FakeCap(0, opened=False), FakeCap(3), FakeCap(0, opened=False)]
    statuses: list[bool] = []
    done = threading.Event()

    def opener(_s: str) -> FakeCap:
        if not caps:
            done.set()
            return FakeCap(0, opened=False)
        return caps.pop(0)

    cam = Camera("gate", "http://phone/video", lambda n, online, f: statuses.append(online), opener=opener,
                 sleep=lambda s: done.wait(0.001))
    cam.start()
    done.wait(2)
    cam.stop()
    assert statuses[:3] == [False, True, False]
    seq, frame, _ = cam.latest()
    assert seq == 3 and frame is not None


def test_recorded_file_ends_offline_unless_holding_last_frame(tmp_path: Path) -> None:
    video = tmp_path / "door.mp4"
    video.write_bytes(b"")  # is_file() only checks that the path exists
    for hold, expected in ((False, [True, False]), (True, [True])):
        statuses: list[bool] = []
        cam = Camera("gate", str(video), lambda n, online, f, s=statuses: s.append(online),
                     opener=lambda _s: FakeCap(2), hold_last=hold)
        cam.start()
        assert cam._thread is not None
        cam._thread.join(2)  # the reader thread returns after the file's last frame
        assert cam.ended and statuses == expected
        seq, frame, _ = cam.latest()
        assert seq == 2 and frame is not None  # the last frame stays available


# ---------------------------------------------------------------- gate pipeline end to end
def walk(pipe: GatePipeline, emb_fn, ys: list[float], x: float = 300, size: float = 120, t0: float = 0.0) -> None:  # noqa: ANN001
    for i, y in enumerate(ys):
        box = (x - size / 2, y - size / 2, x + size / 2, y + size / 2)
        pipe.process([FaceDet(box, 0.85, emb_fn(i))], 640, 480, t0 + i * 0.1)
    for k in range(12):  # face gone -> track ends
        pipe.process([], 640, 480, t0 + (len(ys) + k) * 0.1)


def make_pipe(mode: str = "line") -> tuple[GatePipeline, list[Envelope], list[str]]:
    events: list[Envelope] = []
    fb: list[str] = []
    pipe = GatePipeline(GateConfig(entry_mode=mode, line_a=(0, 0.5), line_b=(1, 0.5), in_side=1), Gallery(), DEV,
                        events.append, fb.append, clock=lambda: datetime(2026, 11, 18, 1, 0, tzinfo=UTC))
    pipe.start(uuid.uuid4(), GALLERY)
    return pipe, events, fb


def types(evs: list[Envelope]) -> list[str]:
    return [e.event_type.value for e in evs]


def test_known_student_walks_in_once() -> None:
    pipe, events, fb = make_pipe()
    walk(pipe, lambda i: near(A, 0.7, 100 + i), [150, 180, 210, 240, 270, 300, 330])
    assert types(events) == ["GATE_PERSON_IN", "GATE_ENTRY_RECOGNISED"]
    rec = events[1]
    assert rec.payload["student_id"] == "stu-a" and rec.payload["votes"] >= 2 and fb == ["ok"]
    assert events[0].payload["track_id"] == rec.payload["track_id"]


def test_same_student_again_is_deduped_but_reentry_after_out_is_reported() -> None:
    pipe, events, _ = make_pipe()
    walk(pipe, lambda i: near(A, 0.7, 100 + i), [150, 200, 250, 300, 350])
    walk(pipe, lambda i: near(A, 0.7, 200 + i), [150, 200, 250, 300, 350], t0=10)  # walks in again, no OUT
    assert types(events).count("GATE_ENTRY_RECOGNISED") == 1
    walk(pipe, lambda i: near(A, 0.7, 300 + i), [350, 300, 250, 200, 150], t0=20)  # goes out
    walk(pipe, lambda i: near(A, 0.7, 400 + i), [150, 200, 250, 300, 350], t0=30)  # re-enters
    assert types(events).count("GATE_PERSON_OUT") == 1
    assert types(events).count("GATE_ENTRY_RECOGNISED") == 2


def test_stranger_is_unknown() -> None:
    pipe, events, fb = make_pipe()
    walk(pipe, lambda i: unit(900 + i), [150, 200, 250, 300, 350])
    assert types(events) == ["GATE_PERSON_IN", "GATE_ENTRY_UNKNOWN"] and fb == ["unknown"]


def test_walking_out_does_not_mark_present() -> None:
    pipe, events, _ = make_pipe()
    walk(pipe, lambda i: near(B, 0.7, 100 + i), [350, 300, 250, 200, 150])
    assert types(events) == ["GATE_PERSON_OUT"] and events[0].payload["student_id"] == "stu-b"


def test_small_faces_are_not_used_for_recognition() -> None:
    pipe, events, _ = make_pipe()
    walk(pipe, lambda i: near(A, 0.7, 100 + i), list(range(150, 351, 15)), size=40)  # small steps: trackable
    assert types(events) == ["GATE_PERSON_IN", "GATE_ENTRY_UNKNOWN"]


def test_presence_mode_counts_a_recognised_face_without_line() -> None:
    pipe, events, _ = make_pipe("presence")
    walk(pipe, lambda i: near(A, 0.7, 100 + i), [240] * 10)
    assert types(events) == ["GATE_PERSON_IN", "GATE_ENTRY_RECOGNISED"]


def test_no_session_no_events_and_stop_wipes_gallery() -> None:
    pipe, events, _ = make_pipe()
    pipe.stop()
    walk(pipe, lambda i: near(A, 0.7, 100 + i), [150, 200, 250, 300, 350])
    assert events == [] and len(pipe.gallery) == 0


def test_gallery_reload_keeps_who_is_already_marked() -> None:
    pipe, events, _ = make_pipe()
    walk(pipe, lambda i: near(A, 0.7, 100 + i), [150, 200, 250, 300, 350])
    c = unit(3)
    pipe.reload_gallery({"students": [*GALLERY["students"], {"id": "stu-c", "embeddings": [c.tolist()]}]})
    walk(pipe, lambda i: near(A, 0.7, 500 + i), [150, 200, 250, 300, 350], t0=10)  # A again: still deduped
    walk(pipe, lambda i: near(c, 0.7, 600 + i), [150, 200, 250, 300, 350], t0=20)  # newly enrolled C recognised
    rec = [e.payload["student_id"] for e in events if e.event_type.value == "GATE_ENTRY_RECOGNISED"]
    assert rec == ["stu-a", "stu-c"]


# ---------------------------------------------------------------- exit camera (inside, beside the door)
def walk_x(pipe: GatePipeline, emb_fn, xs: list[float], y: float = 240, size: float = 120, t0: float = 0.0) -> None:  # noqa: ANN001
    for i, x in enumerate(xs):
        box = (x - size / 2, y - size / 2, x + size / 2, y + size / 2)
        pipe.process([FaceDet(box, 0.85, emb_fn(i))], 640, 480, t0 + i * 0.1)
    for k in range(12):
        pipe.process([], 640, 480, t0 + (len(xs) + k) * 0.1)


def make_exit_pipe(memory: SessionMemory | None = None) -> tuple[GatePipeline, list[Envelope]]:
    from edge.config import ExitYaml, GateYaml

    events: list[Envelope] = []
    # Door on the LEFT of the picture: a vertical line at x = 0.3; crossing to its left (side() > 0) is OUT.
    cfg = ExitYaml(enabled=True, line_a=(0.3, 0.0), line_b=(0.3, 1.0), out_side=1).to_gate_config(GateYaml())
    pipe = GatePipeline(cfg, Gallery(), DEV, events.append, None,
                        clock=lambda: datetime(2026, 11, 22, 2, 0, tzinfo=UTC), memory=memory)
    pipe.start(uuid.uuid4(), GALLERY)
    return pipe, events


def test_exit_camera_reports_the_student_walking_to_the_door() -> None:
    pipe, events = make_exit_pipe()
    walk_x(pipe, lambda i: near(B, 0.7, 100 + i), [400, 340, 280, 220, 160, 100])  # right -> left, toward the door
    assert types(events) == ["GATE_PERSON_OUT"] and events[0].payload["student_id"] == "stu-b"
    assert events[0].model_version.endswith("/ exit")


def test_exit_camera_ignores_people_coming_in_and_people_sitting() -> None:
    pipe, events = make_exit_pipe()
    walk_x(pipe, lambda i: near(A, 0.7, 100 + i), [100, 160, 220, 280, 340, 400])  # entering (seen from behind)
    walk_x(pipe, lambda i: near(B, 0.7, 200 + i), [450] * 15, t0=10)  # seated in the room, never crosses
    assert events == []


def test_exit_then_entry_at_the_door_is_a_reported_reentry() -> None:
    entry, entry_events, _ = make_pipe()
    exit_pipe, exit_events = make_exit_pipe(memory=entry.memory)
    exit_pipe.session_id = entry.session_id
    walk(entry, lambda i: near(A, 0.7, 100 + i), [150, 200, 250, 300, 350])  # comes in
    walk_x(exit_pipe, lambda i: near(A, 0.7, 200 + i), [400, 340, 280, 220, 160, 100], t0=10)  # leaves via the exit camera
    walk(entry, lambda i: near(A, 0.7, 300 + i), [150, 200, 250, 300, 350], t0=20)  # comes back
    assert types(exit_events) == ["GATE_PERSON_OUT"]
    assert types(entry_events).count("GATE_ENTRY_RECOGNISED") == 2


def test_exit_camera_in_presence_mode_marks_any_recognised_face_as_out() -> None:
    from edge.config import ExitYaml, GateYaml

    events: list[Envelope] = []
    cfg = ExitYaml(enabled=True, mode="presence").to_gate_config(GateYaml())
    pipe = GatePipeline(cfg, Gallery(), DEV, events.append, None, clock=lambda: datetime(2026, 11, 22, 2, 0, tzinfo=UTC))
    pipe.start(uuid.uuid4(), GALLERY)
    walk(pipe, lambda i: near(A, 0.7, 100 + i), [240] * 10)  # stands in front of the way-out camera
    assert types(events) == ["GATE_PERSON_OUT"] and events[0].payload["student_id"] == "stu-a"


# ---------------------------------------------------------------- simulated ESP32 door LED (live view)
def test_exit_lights_the_led_amber_and_the_live_view_shows_it() -> None:
    from edge.config import ExitYaml, GateYaml
    from edge.liveview import LiveView

    fb: list[str] = []
    cfg = ExitYaml(enabled=True, line_a=(0.3, 0.0), line_b=(0.3, 1.0), out_side=1).to_gate_config(GateYaml())
    pipe = GatePipeline(cfg, Gallery(), DEV, lambda e: None, fb.append, clock=lambda: datetime(2026, 11, 22, 2, 0, tzinfo=UTC))
    pipe.start(uuid.uuid4(), GALLERY)
    walk_x(pipe, lambda i: near(B, 0.7, 100 + i), [400, 340, 280, 220, 160, 100])
    assert fb == ["left"]

    view = LiveView()
    assert view.led_state()["color"] == "off"
    for result, color in (("ok", "green"), ("unknown", "red"), ("left", "amber")):
        view.led(result)
        assert view.led_state()["color"] == color
    view._led = ("ok", view._led[1] - 2.0)  # 2 s later: the firmware turns the LED off after 1.5 s
    assert view.led_state() == {"color": "off", "last": "ok", "seconds_ago": 2.0}
