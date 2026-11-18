"""SQLite outbox: every event is written BEFORE publishing and marked sent on PUBACK.

Unsent events are replayed (with their original observed_at) after a reconnect or a restart.
Named outbox.py (not queue.py) so it does not shadow the standard library `queue` module.
"""

from __future__ import annotations

import sqlite3
import threading
from pathlib import Path

from attendiq_common.envelope import Envelope

SCHEMA = """
create table if not exists outbox (
  event_id text primary key,
  topic text not null,
  body text not null,
  created_at real not null default (julianday('now')),
  sent_at real
);
create index if not exists outbox_unsent on outbox (sent_at) where sent_at is null;
"""


class Outbox:
    def __init__(self, path: str | Path) -> None:
        if str(path) != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self._db = sqlite3.connect(str(path), check_same_thread=False, isolation_level=None)
        self._db.execute("pragma journal_mode=wal")
        self._db.executescript(SCHEMA)
        self._lock = threading.Lock()

    def put(self, topic: str, env: Envelope) -> bool:
        """False if this event_id is already stored (idempotent)."""
        with self._lock:
            cur = self._db.execute("insert or ignore into outbox (event_id, topic, body) values (?, ?, ?)",
                                   (str(env.event_id), topic, env.to_json()))
            return cur.rowcount == 1

    def mark_sent(self, event_id: str) -> None:
        with self._lock:
            self._db.execute("update outbox set sent_at = julianday('now') where event_id = ? and sent_at is null", (event_id,))

    def unsent(self, limit: int = 500) -> list[tuple[str, str, str]]:
        with self._lock:
            return self._db.execute("select event_id, topic, body from outbox where sent_at is null order by created_at limit ?",
                                    (limit,)).fetchall()

    def pending_count(self) -> int:
        with self._lock:
            return int(self._db.execute("select count(*) from outbox where sent_at is null").fetchone()[0])

    def prune(self, keep_days: float = 2.0) -> int:
        with self._lock:
            sql = "delete from outbox where sent_at is not null and sent_at < julianday('now') - ?"
            cur = self._db.execute(sql, (keep_days,))
            return cur.rowcount


class Publisher:
    """Writes to the outbox, then publishes; PUBACK marks it sent. `send` returns a message id or None when offline."""

    def __init__(self, outbox: Outbox, send) -> None:  # noqa: ANN001 - send(topic, body) -> int | None
        self.outbox = outbox
        self._send = send
        self._inflight: dict[int, str] = {}
        self._lock = threading.Lock()

    def publish(self, topic: str, env: Envelope) -> None:
        if self.outbox.put(topic, env):
            self._try(str(env.event_id), topic, env.to_json())

    def _try(self, event_id: str, topic: str, body: str) -> None:
        mid = self._send(topic, body)
        if mid is not None:
            with self._lock:
                self._inflight[mid] = event_id

    def on_puback(self, mid: int) -> None:
        with self._lock:
            event_id = self._inflight.pop(mid, None)
        if event_id:
            self.outbox.mark_sent(event_id)

    def replay(self) -> int:
        """Re-sends everything not yet acknowledged (call after (re)connect)."""
        with self._lock:
            waiting = set(self._inflight.values())
            self._inflight.clear()
        rows = [r for r in self.outbox.unsent() if r[0] not in waiting] + [r for r in self.outbox.unsent() if r[0] in waiting]
        for event_id, topic, body in rows:
            self._try(event_id, topic, body)
        return len(rows)
