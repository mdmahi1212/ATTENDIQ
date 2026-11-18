"""Batches MQTT messages and posts them; acks a message to the broker only after the server stored it.

Pure logic (clock and sender injected) so it is unit-testable without MQTT or HTTP.
Delivery guarantee: at-least-once. The broker redelivers unacked QoS 1 messages after a crash or
reconnect (persistent session), and the server ignores duplicate event_ids, so the end result is exactly-once.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from pydantic import ValidationError

from attendiq_common.api import EdgeApiError
from attendiq_common.envelope import Envelope

log = logging.getLogger("ingest.batcher")

Ack = Callable[[], None]
Sender = Callable[[list[dict[str, Any]]], dict[str, Any]]


@dataclass
class Stats:
    received: int = 0
    invalid: int = 0
    posted: int = 0
    accepted: int = 0
    duplicates: int = 0
    rejected: int = 0
    failures: int = 0
    rejected_reasons: dict[str, int] = field(default_factory=dict)


class Batcher:
    def __init__(self, send: Sender, clock: Callable[[], float], max_events: int = 100, max_wait_s: float = 1.0,
                 max_backoff_s: float = 60.0) -> None:
        self._send = send
        self._clock = clock
        self.max_events = max_events
        self.max_wait_s = max_wait_s
        self.max_backoff_s = max_backoff_s
        self._items: list[tuple[dict[str, Any], Ack]] = []
        self._first_at: float | None = None
        self._backoff = 0.0
        self._retry_at = 0.0
        self.stats = Stats()

    def __len__(self) -> int:
        return len(self._items)

    def add_raw(self, raw: bytes, ack: Ack) -> bool:
        """Validates one MQTT payload. Invalid messages are acked (dropped) so they never block the queue."""
        self.stats.received += 1
        try:
            env = Envelope.from_json(raw)
        except (ValidationError, ValueError) as e:
            self.stats.invalid += 1
            log.warning("invalid envelope dropped: %s", str(e).splitlines()[0][:200])
            ack()
            return False
        self._items.append((json.loads(env.to_json()), ack))
        if self._first_at is None:
            self._first_at = self._clock()
        return True

    def due(self) -> bool:
        if not self._items or self._clock() < self._retry_at:
            return False
        return len(self._items) >= self.max_events or self._clock() - (self._first_at or 0) >= self.max_wait_s

    def flush(self, force: bool = False) -> bool:
        """Posts up to max_events. Returns True if something was delivered (or permanently rejected)."""
        if not self._items or (not force and not self.due()):
            return False
        chunk = self._items[: self.max_events]
        try:
            res = self._send([e for e, _ in chunk])
        except EdgeApiError as e:
            if e.retryable:
                self.stats.failures += 1
                self._backoff = min(self.max_backoff_s, max(1.0, self._backoff * 2))
                self._retry_at = self._clock() + self._backoff
                log.warning("post failed (%s); retry in %.0fs, %d queued", e, self._backoff, len(self._items))
                return False
            # 4xx: the whole batch is malformed for the server. Drop it rather than loop forever.
            log.error("batch rejected by server, dropping %d events: %s", len(chunk), e)
            self.stats.rejected += len(chunk)
            self._done(chunk)
            return True
        self._backoff = 0.0
        self._retry_at = 0.0
        self.stats.posted += len(chunk)
        self.stats.accepted += int(res.get("accepted", 0))
        self.stats.duplicates += int(res.get("duplicates", 0))
        for r in res.get("rejected", []):
            self.stats.rejected += 1
            reason = str(r.get("reason", "?"))
            self.stats.rejected_reasons[reason] = self.stats.rejected_reasons.get(reason, 0) + 1
            log.warning("event %s rejected: %s", r.get("event_id"), reason)
        self._done(chunk)
        return True

    def _done(self, chunk: list[tuple[dict[str, Any], Ack]]) -> None:
        for _, ack in chunk:
            ack()
        del self._items[: len(chunk)]
        self._first_at = self._clock() if self._items else None
