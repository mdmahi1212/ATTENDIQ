"""HTTPS client for the Next.js edge API (Authorization: Bearer <device key>)."""

from __future__ import annotations

import statistics
import time
from email.utils import parsedate_to_datetime
from typing import Any

import httpx


class EdgeApiError(RuntimeError):
    def __init__(self, status: int, message: str) -> None:
        super().__init__(f"HTTP {status}: {message}")
        self.status = status

    @property
    def retryable(self) -> bool:
        return self.status >= 500 or self.status in (0, 408, 429)


class EdgeApi:
    def __init__(self, base_url: str, device_key: str, timeout: float = 15.0, client: httpx.Client | None = None) -> None:
        self._client = client or httpx.Client(timeout=timeout)
        self._base = base_url.rstrip("/") + "/api/edge/v1"
        self._headers = {"Authorization": f"Bearer {device_key}"}
        self._offsets: list[float] = []

    @property
    def clock_offset(self) -> float:
        """Seconds to ADD to the local clock to get server time (median of recent samples; 0 if unknown).

        Measured from the HTTP Date header (1 s resolution), so it corrects a badly set laptop clock;
        an NTP-synced clock stays within about +-0.5 s.
        """
        return statistics.median(self._offsets) if self._offsets else 0.0

    def _sample_clock(self, res: httpx.Response, t_send: float, t_recv: float) -> None:
        date = res.headers.get("date")
        if not date:
            return
        try:
            server = parsedate_to_datetime(date).timestamp() + 0.5  # Date is truncated to the second
        except (TypeError, ValueError):
            return
        self._offsets.append(server - (t_send + t_recv) / 2)
        del self._offsets[:-9]

    def _call(self, method: str, path: str, **kw: Any) -> httpx.Response:
        try:
            t_send = time.time()
            res = self._client.request(method, self._base + path, headers=self._headers, **kw)
            self._sample_clock(res, t_send, time.time())
        except httpx.HTTPError as e:
            raise EdgeApiError(0, str(e)) from e
        if res.status_code >= 400:
            raise EdgeApiError(res.status_code, res.text[:300])
        return res

    def current_session(self, room: str) -> dict[str, Any] | None:
        res = self._call("GET", "/sessions/current", params={"room": room})
        return None if res.status_code == 204 else res.json()

    def gallery(self, session_id: str) -> dict[str, Any]:
        return self._call("GET", f"/sessions/{session_id}/gallery").json()

    def post_events(self, events: list[dict[str, Any]]) -> dict[str, Any]:
        return self._call("POST", "/events", json=events).json()

    def heartbeat(self, status: dict[str, Any]) -> dict[str, Any]:
        return self._call("POST", "/heartbeat", json={"status": status}).json()

    def demo_session(self, started_minutes_ago: int, minutes: int) -> dict[str, Any]:
        return self._call("POST", "/sessions/demo", json={"started_minutes_ago": started_minutes_ago, "minutes": minutes}).json()

    def demo_class(self, section: str, minutes: int) -> dict[str, Any]:
        """Edge only: start a short real demo class (5 / 10 / 15 min) for a section in this device's room."""
        return self._call("POST", "/sessions/demo-class", json={"section": section, "minutes": minutes}).json()

    def session_results(self, session_id: str) -> dict[str, Any]:
        return self._call("GET", f"/sessions/{session_id}/results").json()

    def publish_face_api_url(self, url: str) -> None:
        self._call("POST", "/face-api-url", json={"url": url})
