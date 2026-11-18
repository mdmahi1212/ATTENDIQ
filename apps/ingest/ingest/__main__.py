"""python -m ingest  (reads apps/ingest/.env)."""

from __future__ import annotations

import json
import logging
import signal
import ssl
import threading
import time

import paho.mqtt.client as mqtt

from attendiq_common import topics
from attendiq_common.api import EdgeApi, EdgeApiError
from ingest.batcher import Batcher
from ingest.config import Settings
from ingest.sessions import SessionWatcher


def main() -> None:
    s = Settings()  # type: ignore[call-arg]
    fmt = '{"t":"%(asctime)s","lvl":"%(levelname)s","log":"%(name)s","msg":"%(message)s"}'
    logging.basicConfig(level=s.log_level, format=fmt)
    log = logging.getLogger("ingest")
    api = EdgeApi(s.api_base_url, s.ingest_device_key)
    lock = threading.Lock()
    batcher = Batcher(api.post_events, time.monotonic, s.batch_max_events, s.batch_max_wait_ms / 1000,
                      s.retry_max_backoff_seconds)
    watcher = SessionWatcher(api.current_session)
    stop = threading.Event()

    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=s.mqtt_client_id, clean_session=False, manual_ack=True)
    if s.mqtt_username:
        client.username_pw_set(s.mqtt_username, s.mqtt_password)
    if s.mqtt_tls:
        client.tls_set(ca_certs=s.mqtt_ca_file or None, tls_version=ssl.PROTOCOL_TLS_CLIENT)
    client.reconnect_delay_set(1, 30)

    def on_connect(c: mqtt.Client, _u: object, _f: object, rc: mqtt.ReasonCode, _p: object) -> None:
        if rc.is_failure:
            log.error("mqtt connect failed: %s", rc)
            return
        subs = [(t, 1) for room in s.rooms for t in topics.event_subscriptions(room)]
        c.subscribe(subs)
        log.info("connected; subscribed %s", [t for t, _ in subs])

    def on_message(c: mqtt.Client, _u: object, msg: mqtt.MQTTMessage) -> None:
        with lock:
            batcher.add_raw(msg.payload, lambda: c.ack(msg.mid, msg.qos))

    client.on_connect = on_connect
    client.on_message = on_message
    client.connect_async(s.mqtt_host, s.mqtt_port, keepalive=30)
    client.loop_start()

    def shutdown(*_: object) -> None:
        stop.set()

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    next_poll = 0.0
    next_stats = time.monotonic() + 60
    while not stop.is_set():
        with lock:
            while batcher.due():
                if not batcher.flush():
                    break
        now = time.monotonic()
        if now >= next_poll:
            next_poll = now + s.session_poll_seconds
            for room in s.rooms:
                try:
                    cmd = watcher.poll(room)
                except EdgeApiError as e:
                    log.warning("session poll failed for %s: %s", room, e)
                    continue
                if cmd:
                    client.publish(topics.control(room), cmd.model_dump_json(), qos=1, retain=True)
                    log.info("control %s -> %s", room, cmd.model_dump_json())
        if now >= next_stats:
            next_stats = now + 60
            log.info("stats %s queued=%d", json.dumps(batcher.stats.__dict__), len(batcher))
        stop.wait(0.05)

    with lock:
        batcher.flush(force=True)
    client.loop_stop()
    client.disconnect()
    log.info("stopped")


if __name__ == "__main__":
    main()
