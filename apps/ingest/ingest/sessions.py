"""Polls the current session per room and turns changes into control commands for the edge."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from attendiq_common.envelope import ControlCommand


class SessionWatcher:
    def __init__(self, fetch: Callable[[str], dict[str, Any] | None]) -> None:
        self._fetch = fetch
        self.current: dict[str, str | None] = {}

    def poll(self, room: str) -> ControlCommand | None:
        """Returns a command when the room's session changed since the last poll (None on errors too)."""
        session = self._fetch(room)
        sid = str(session["id"]) if session else None
        if room in self.current and self.current[room] == sid:
            return None
        self.current[room] = sid
        return ControlCommand(cmd="start", session_id=sid) if sid else ControlCommand(cmd="stop")
