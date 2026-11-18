import json
import uuid
from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from attendiq_common import topics
from attendiq_common.envelope import Envelope, EventType

DEV = uuid.UUID("e0000000-0000-4000-8000-000000000003")
SESS = uuid.uuid4()


def test_round_trip_and_wire_format() -> None:
    e = Envelope(event_type=EventType.GATE_ENTRY_RECOGNISED, source_device_id=DEV, session_id=SESS,
                 observed_at=datetime(2026, 11, 18, 1, 2, 3, 456789, tzinfo=UTC), payload={"track_id": 1}, simulation=True)
    wire = json.loads(e.to_json())
    assert wire["observed_at"] == "2026-11-18T01:02:03.456Z"
    assert wire["event_type"] == "GATE_ENTRY_RECOGNISED"
    ms = datetime(2026, 11, 18, 1, 2, 3, 456000, tzinfo=UTC)
    assert Envelope.from_json(e.to_json()) == e.model_copy(update={"observed_at": ms})


def test_naive_timestamp_and_unknown_fields_rejected() -> None:
    with pytest.raises(ValidationError):
        Envelope(event_type=EventType.GATE_PERSON_IN, source_device_id=DEV, session_id=SESS, observed_at=datetime(2026, 1, 1))
    with pytest.raises(ValidationError):
        Envelope.model_validate({"event_type": "GATE_PERSON_IN", "source_device_id": str(DEV), "session_id": str(SESS), "x": 1})


def test_session_required_except_for_device_events() -> None:
    with pytest.raises(ValidationError):
        Envelope(event_type=EventType.GATE_ENTRY_UNKNOWN, source_device_id=DEV)
    assert Envelope(event_type=EventType.EDGE_HEARTBEAT, source_device_id=DEV).session_id is None
    with pytest.raises(ValidationError):
        Envelope.model_validate({"event_type": "NOPE", "source_device_id": str(DEV)})


def test_topics() -> None:
    assert topics.for_event("B204", EventType.GATE_PERSON_OUT) == "campus/B204/gate/event"
    assert topics.for_event("B204", EventType.OCCUPANCY_UPDATED) == "campus/B204/inside/occupancy"
    assert topics.for_event("B204", EventType.EDGE_HEARTBEAT) == "campus/B204/device/heartbeat"
    assert topics.room_of("campus/B204/control") == "B204"
    assert topics.room_of("other/B204/x") is None


def test_clock_offset_from_date_header() -> None:
    import httpx

    from attendiq_common.api import EdgeApi

    def handler(request: httpx.Request) -> httpx.Response:
        import time
        from email.utils import formatdate

        return httpx.Response(204, headers={"date": formatdate(time.time() + 156, usegmt=True)})

    api = EdgeApi("http://x", "k", client=httpx.Client(transport=httpx.MockTransport(handler)))
    assert api.clock_offset == 0.0
    for _ in range(3):
        api.current_session("B204")
    assert 155 <= api.clock_offset <= 157.5
