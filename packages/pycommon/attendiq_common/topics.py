"""MQTT topics. room = room code, e.g. B204."""

from __future__ import annotations

from attendiq_common.envelope import EventType

PREFIX = "campus"


def gate_event(room: str) -> str:
    return f"{PREFIX}/{room}/gate/event"


def occupancy(room: str) -> str:
    return f"{PREFIX}/{room}/inside/occupancy"


def heartbeat(room: str) -> str:
    return f"{PREFIX}/{room}/device/heartbeat"


def feedback(room: str) -> str:
    return f"{PREFIX}/{room}/gate/feedback"


def control(room: str) -> str:
    return f"{PREFIX}/{room}/control"


def for_event(room: str, event_type: EventType) -> str:
    if event_type == EventType.OCCUPANCY_UPDATED:
        return occupancy(room)
    if event_type == EventType.EDGE_HEARTBEAT:
        return heartbeat(room)
    return gate_event(room)


def event_subscriptions(room: str) -> list[str]:
    """What the ingest worker subscribes to for one room."""
    return [gate_event(room), occupancy(room), heartbeat(room)]


def room_of(topic: str) -> str | None:
    parts = topic.split("/")
    return parts[1] if len(parts) >= 3 and parts[0] == PREFIX else None
