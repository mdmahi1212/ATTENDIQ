"""Event envelope (docs/ARCHITECTURE.md "Evidence model and event contract").

Every MQTT message and every edge API call carries this shape. The server dedupes by event_id
and keeps observed_at (edge clock, NTP-synced) separate from received_at (server clock).
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_serializer, field_validator, model_validator


class EventType(StrEnum):
    GATE_PERSON_IN = "GATE_PERSON_IN"
    GATE_PERSON_OUT = "GATE_PERSON_OUT"
    GATE_ENTRY_RECOGNISED = "GATE_ENTRY_RECOGNISED"
    GATE_ENTRY_UNKNOWN = "GATE_ENTRY_UNKNOWN"
    OCCUPANCY_UPDATED = "OCCUPANCY_UPDATED"
    CAMERA_OFFLINE = "CAMERA_OFFLINE"
    CAMERA_ONLINE = "CAMERA_ONLINE"
    EDGE_HEARTBEAT = "EDGE_HEARTBEAT"


SESSIONLESS = {EventType.CAMERA_OFFLINE, EventType.CAMERA_ONLINE, EventType.EDGE_HEARTBEAT}


def utcnow() -> datetime:
    return datetime.now(UTC)


class Envelope(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    event_id: uuid.UUID = Field(default_factory=uuid.uuid4)
    event_type: EventType
    source_device_id: uuid.UUID
    session_id: uuid.UUID | None = None
    observed_at: datetime = Field(default_factory=utcnow)
    received_at: datetime | None = None
    model_version: str | None = None
    payload: dict[str, Any] = Field(default_factory=dict)
    simulation: bool = False

    @field_validator("observed_at")
    @classmethod
    def _aware(cls, v: datetime) -> datetime:
        if v.tzinfo is None:
            raise ValueError("observed_at must be timezone-aware (UTC)")
        return v.astimezone(UTC)

    @model_validator(mode="after")
    def _session_needed(self) -> Envelope:
        if self.session_id is None and self.event_type not in SESSIONLESS:
            raise ValueError(f"{self.event_type} needs a session_id")
        return self

    @field_serializer("observed_at", "received_at")
    def _iso(self, v: datetime | None) -> str | None:
        return None if v is None else v.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")

    def to_json(self) -> str:
        return self.model_dump_json()

    @classmethod
    def from_json(cls, raw: str | bytes) -> Envelope:
        return cls.model_validate_json(raw)


class GateFeedback(BaseModel):
    """campus/{room}/gate/feedback (edge -> ESP32 LED)."""

    result: str  # "ok" | "unknown"


class ControlCommand(BaseModel):
    """campus/{room}/control (ingest -> edge)."""

    cmd: str  # "start" | "stop" | "reload_gallery"
    session_id: uuid.UUID | None = None
