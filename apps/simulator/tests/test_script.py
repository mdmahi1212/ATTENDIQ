import uuid
from collections import Counter
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from attendiq_common.envelope import EventType
from simulator.script import Script, build_events, load, parse_ids, sim_student, status_for

DEMO = Path(__file__).resolve().parent.parent / "scripts" / "demo.yaml"
T0 = datetime(2026, 11, 18, 1, 30, tzinfo=UTC)
DEV, SESS = uuid.UUID("e0000000-0000-4000-8000-000000000003"), uuid.uuid4()


def test_parse_ids() -> None:
    assert parse_ids("01-03,07") == [1, 2, 3, 7]
    with pytest.raises(ValueError):
        parse_ids("29-31")


def test_demo_covers_all_30_students_once() -> None:
    exp = load(DEMO).expected()
    assert len(exp) == 30
    assert Counter(v["status"] for v in exp.values()) == {"present": 22, "late": 5, "pending": 3}


def test_expected_status_matches_timing_rule() -> None:
    s = load(DEMO)
    for g in s.students:
        for t in g.arrival_times():
            if t is not None:
                assert status_for(t) == g.expect, (g.ids, t)


def test_events_are_ordered_simulated_and_in_session() -> None:
    evs = build_events(load(DEMO), T0, DEV, SESS)
    assert all(e.simulation and e.session_id == SESS and e.source_device_id == DEV for e in evs)
    body = evs[: len(evs) - 3]
    assert [e.observed_at for e in body] == sorted(e.observed_at for e in body)


def test_recognised_and_unknown_counts() -> None:
    evs = build_events(load(DEMO), T0, DEV, SESS)
    rec = [e for e in evs if e.event_type == EventType.GATE_ENTRY_RECOGNISED]
    ids = Counter(e.payload["student_id"] for e in rec)
    # 27 students arrive; #27 re-enters (2); 3 duplicates resent with identical event_ids
    assert len({e.event_id for e in rec}) == 28
    assert len(rec) == 28 + 3
    assert ids[str(sim_student(27))] >= 2
    assert str(sim_student(28)) not in ids
    assert sum(e.event_type == EventType.GATE_ENTRY_UNKNOWN for e in evs) == 1
    assert sum(e.event_type == EventType.GATE_PERSON_OUT for e in evs) == 2


def test_occupancy_tracks_people_inside() -> None:
    evs = build_events(load(DEMO), T0, DEV, SESS)
    occ = [e for e in evs if e.event_type == EventType.OCCUPANCY_UPDATED]
    last = max(occ, key=lambda e: e.observed_at)
    # 27 students arrived, #26 left at 50 (#27 left and came back) -> 26, + 1 visitor + 1 professor = 28
    assert last.payload["raw"] == 28
    before = min(occ, key=lambda e: e.observed_at)
    assert before.observed_at - T0 < timedelta(minutes=1)


def test_duplicate_students_rejected() -> None:
    s = Script.model_validate({"name": "x", "students": [{"ids": "01", "expect": "pending"}, {"ids": "01", "expect": "present"}]})
    with pytest.raises(ValueError):
        s.expected()
