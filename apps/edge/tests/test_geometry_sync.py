import threading
import time
from types import SimpleNamespace

import numpy as np

from edge.config import ExitYaml, GateYaml, InsideYaml
from edge.gate import GateConfig
from edge.geometry_sync import SnapshotSender, apply, out_side, plan


def test_door_point_decides_which_crossing_is_out() -> None:
    # vertical line at x = 0.3, top to bottom; door on the LEFT -> side() > 0 there
    assert out_side((0.3, 0.0), (0.3, 1.0), (0.1, 0.5)) == 1
    assert out_side((0.3, 0.0), (0.3, 1.0), (0.6, 0.5)) == -1
    assert out_side((0.3, 0.0), (0.3, 1.0), (0.3, 0.5)) is None


def test_plan_keeps_only_valid_drawn_geometry() -> None:
    rows = [
        {"kind": "inside", "roi": [[0, 0.3], [1, 0.3], [1, 1]], "exit_line": [[0.3, 0], [0.3, 1]], "door_point": [0.1, 0.5]},
        {"kind": "gate", "entry_line": [[0, 0.5], [1, 0.5]], "roi": None},
    ]
    p = plan(rows)
    assert p == {"roi": [(0, 0.3), (1, 0.3), (1, 1)], "exit_line": [(0.3, 0), (0.3, 1)], "out_side": 1,
                 "entry_line": [(0, 0.5), (1, 0.5)]}
    assert plan([{"kind": "inside", "exit_line": [[0.3, 0], [0.3, 1]], "door_point": None}]) == {}  # no door side
    assert plan([{"kind": "inside", "roi": [[0, 0], [2, 0], [1, 1]]}]) == {}  # out of range
    assert plan([]) == {}


def test_apply_updates_config_pipelines_and_body_tracker_once() -> None:
    cfg = SimpleNamespace(inside=InsideYaml(), exit=ExitYaml(enabled=True))
    gate = SimpleNamespace(cfg=GateConfig())
    exit_gate = SimpleNamespace(cfg=cfg.exit.to_gate_config(GateYaml()))
    body = SimpleNamespace(line_a=None, line_b=None, out_side=None)
    p = plan([{"kind": "inside", "roi": [[0, 0.4], [1, 0.4], [1, 1], [0, 1]], "exit_line": [[0.8, 0], [0.8, 1]],
               "door_point": [0.95, 0.5]}])
    assert apply(p, cfg, gate, exit_gate, body) == ["seat area", "exit line"]
    assert cfg.exit.out_side == -1 and exit_gate.cfg.in_side == 1 and exit_gate.cfg.line_a == (0.8, 0)
    assert (body.line_a, body.out_side) == ((0.8, 0), -1)
    assert apply(p, cfg, gate, exit_gate, body) == []  # nothing new the second time


def test_snapshot_sender_sends_right_away_then_waits() -> None:
    sent: list[tuple[str, int]] = []
    done = threading.Event()

    def send(kind: str, jpeg: bytes) -> None:
        sent.append((kind, len(jpeg)))
        done.set()

    s = SnapshotSender(send, every_s=60)
    frame = np.zeros((720, 2000, 3), np.uint8)  # wider than 1280 -> resized
    assert s.due("gate")
    s.offer("gate", frame)
    assert done.wait(5)
    time.sleep(0.05)
    assert sent[0][0] == "gate" and sent[0][1] > 100
    assert not s.due("gate") and s.due("inside")


def test_rotation_from_the_website_is_applied_once() -> None:
    cfg = SimpleNamespace(gate=GateYaml(), inside=InsideYaml(), exit=ExitYaml())
    gate = SimpleNamespace(cfg=GateConfig())
    p = plan([{"kind": "gate", "rotate": 90}, {"kind": "inside", "rotate": 180}, {"kind": "gate", "rotate": 45}])
    assert p == {"rotate_gate": 90, "rotate_inside": 180}
    assert apply(p, cfg, gate, None, None) == ["door rotation 90", "room rotation 180"]
    assert (cfg.gate.rotate, cfg.inside.rotate) == (90, 180)
    assert apply(p, cfg, gate, None, None) == []
