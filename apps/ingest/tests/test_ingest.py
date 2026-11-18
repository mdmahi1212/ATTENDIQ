import json
import uuid
from typing import Any

from attendiq_common.api import EdgeApiError
from attendiq_common.envelope import Envelope, EventType
from ingest.batcher import Batcher
from ingest.sessions import SessionWatcher

DEV = uuid.UUID("e0000000-0000-4000-8000-000000000001")
SESS = uuid.uuid4()


class Clock:
    def __init__(self) -> None:
        self.t = 0.0

    def __call__(self) -> float:
        return self.t


class Server:
    """Fake /events: dedupes by event_id like apply_edge_events."""

    def __init__(self) -> None:
        self.seen: set[str] = set()
        self.calls = 0
        self.fail: list[EdgeApiError] = []

    def __call__(self, events: list[dict[str, Any]]) -> dict[str, Any]:
        self.calls += 1
        if self.fail:
            raise self.fail.pop(0)
        acc = dup = 0
        for e in events:
            if e["event_id"] in self.seen:
                dup += 1
            else:
                self.seen.add(e["event_id"])
                acc += 1
        return {"accepted": acc, "duplicates": dup, "rejected": []}


def raw(**kw: Any) -> bytes:
    return Envelope(event_type=EventType.GATE_PERSON_IN, source_device_id=DEV, session_id=SESS, **kw).to_json().encode()


def make(max_events: int = 3, wait: float = 1.0) -> tuple[Batcher, Server, Clock, list[int]]:
    server, clock, acks = Server(), Clock(), []
    return Batcher(server, clock, max_events, wait, max_backoff_s=8), server, clock, acks


def test_flushes_on_size_or_time_and_acks_after_post() -> None:
    b, server, clock, acks = make(max_events=3, wait=1.0)
    for i in range(2):
        b.add_raw(raw(), lambda i=i: acks.append(i))
    assert not b.due()
    clock.t = 1.0
    assert b.due() and b.flush()
    assert acks == [0, 1] and server.calls == 1 and len(b) == 0
    for i in range(3):
        b.add_raw(raw(), lambda i=i: acks.append(10 + i))
    assert b.due()  # size reached immediately


def test_invalid_payloads_are_acked_and_dropped() -> None:
    b, server, _, acks = make()
    assert not b.add_raw(b"not json", lambda: acks.append(1))
    assert not b.add_raw(json.dumps({"event_type": "GATE_PERSON_IN"}).encode(), lambda: acks.append(2))
    assert acks == [1, 2] and len(b) == 0 and b.stats.invalid == 2


def test_server_outage_keeps_events_unacked_with_backoff_then_delivers() -> None:
    b, server, clock, acks = make(max_events=10, wait=0)
    server.fail = [EdgeApiError(503, "down"), EdgeApiError(0, "network")]
    b.add_raw(raw(), lambda: acks.append(1))
    assert not b.flush() and acks == []
    assert not b.due()  # backing off (1 s)
    clock.t = 1.0
    assert not b.flush()  # second failure -> 2 s
    clock.t = 2.5
    assert not b.due()
    clock.t = 3.0
    assert b.flush() and acks == [1] and b.stats.failures == 2


def test_redelivery_after_crash_is_idempotent() -> None:
    b, server, clock, acks = make(max_events=10, wait=0)
    msg = raw()
    b.add_raw(msg, lambda: acks.append(1))
    b.flush()
    b2 = Batcher(server, clock, 10, 0)  # new process; broker redelivers the same message
    b2.add_raw(msg, lambda: acks.append(2))
    b2.flush()
    assert server.seen.__len__() == 1 and b2.stats.duplicates == 1 and acks == [1, 2]


def test_client_error_drops_batch_instead_of_looping() -> None:
    b, server, _, acks = make(wait=0)
    server.fail = [EdgeApiError(400, "bad")]
    b.add_raw(raw(), lambda: acks.append(1))
    assert b.flush() and acks == [1] and len(b) == 0


def test_original_observed_at_is_kept() -> None:
    from datetime import UTC, datetime

    b, server, _, _ = make(wait=0)
    sent: list[dict[str, Any]] = []
    b._send = lambda evs: (sent.extend(evs), {"accepted": len(evs), "duplicates": 0, "rejected": []})[1]  # type: ignore[method-assign]
    b.add_raw(raw(observed_at=datetime(2026, 11, 18, 0, 0, 1, tzinfo=UTC)), lambda: None)
    b.flush()
    assert sent[0]["observed_at"] == "2026-11-18T00:00:01.000Z"


def test_session_watcher_emits_only_on_change() -> None:
    state: dict[str, Any] = {"s": None}
    w = SessionWatcher(lambda room: state["s"])
    assert w.poll("B204").cmd == "stop"  # first poll always announces
    assert w.poll("B204") is None
    state["s"] = {"id": str(uuid.uuid4())}
    cmd = w.poll("B204")
    assert cmd and cmd.cmd == "start" and str(cmd.session_id) == state["s"]["id"]
    assert w.poll("B204") is None
    state["s"] = None
    assert w.poll("B204").cmd == "stop"
