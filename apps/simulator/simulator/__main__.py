"""python -m simulator run --room B204 --script scripts/demo.yaml [--direct] [--realtime --speed 10]

--direct posts straight to the web API (no broker needed); default publishes over MQTT for the ingest worker.
Default (replay) mode creates a simulation session that started in the past and replays the whole class with
past observed_at values in a few seconds. --realtime starts the session now and plays events on the clock.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import time
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

from attendiq_common import topics
from attendiq_common.api import EdgeApi
from simulator.script import build_events, load


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=Path(__file__).resolve().parent.parent / ".env", extra="ignore")
    room_code: str = "B204"
    sim_device_id: str
    sim_device_key: str
    api_base_url: str
    mqtt_host: str = "127.0.0.1"
    mqtt_port: int = 1883
    mqtt_username: str = ""
    mqtt_password: str = ""
    mqtt_client_id: str = "simulator-B204"
    log_level: str = "INFO"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="simulator")
    sub = ap.add_subparsers(dest="cmd", required=True)
    run = sub.add_parser("run")
    run.add_argument("--room", default=None)
    run.add_argument("--script", default=str(Path(__file__).resolve().parent.parent / "scripts" / "demo.yaml"))
    run.add_argument("--direct", action="store_true", help="POST to the web API instead of MQTT")
    run.add_argument("--realtime", action="store_true", help="start the class now and play events on the clock")
    run.add_argument("--speed", type=float, default=1.0, help="with --realtime: 10 = ten times faster")
    args = ap.parse_args(argv)

    s = Settings()  # type: ignore[call-arg]
    logging.basicConfig(level=s.log_level, format="%(asctime)s %(levelname)s %(message)s")
    log = logging.getLogger("simulator")
    room = args.room or s.room_code
    script = load(args.script)
    api = EdgeApi(s.api_base_url, s.sim_device_key)

    ago = 0 if args.realtime else int(script.last_minute) + 3
    created = api.demo_session(started_minutes_ago=ago, minutes=max(script.minutes, ago + 10))
    session = created["session"]
    t0 = datetime.fromisoformat(session["starts_at"])
    log.info("simulation session %s (T0 %s, %s min)", session["id"], t0.isoformat(), script.minutes)
    events = build_events(script, t0, uuid.UUID(s.sim_device_id), uuid.UUID(session["id"]))
    log.info("%d events (%d students expected)", len(events), len(script.expected()))

    publish = None
    client = None
    if not args.direct:
        import paho.mqtt.client as mqtt

        client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=s.mqtt_client_id)
        if s.mqtt_username:
            client.username_pw_set(s.mqtt_username, s.mqtt_password)
        client.connect(s.mqtt_host, s.mqtt_port, keepalive=30)
        client.loop_start()

        def publish(batch: list) -> None:  # type: ignore[no-redef]
            for e in batch:
                info = client.publish(topics.for_event(room, e.event_type), e.to_json(), qos=1)
                info.wait_for_publish(10)

    def send(batch: list) -> None:
        if publish:
            publish(batch)
        else:
            for i in range(0, len(batch), 200):
                res = api.post_events([json.loads(e.to_json()) for e in batch[i : i + 200]])
                log.info("posted %d -> %s", len(batch[i : i + 200]), json.dumps(res)[:300])

    if args.realtime:
        for e in events:
            wait = (e.observed_at - datetime.now(UTC)).total_seconds() / args.speed
            if wait > 0:
                time.sleep(wait)
            send([e.model_copy(update={"observed_at": datetime.now(UTC)}) if args.speed != 1 else e])
    else:
        future = [e for e in events if e.observed_at > datetime.now(UTC) + timedelta(seconds=30)]
        if future:
            log.error("%d events would be in the future; script too long for replay", len(future))
            return 2
        send(events)
    if client:
        client.loop_stop()
        client.disconnect()
    print(json.dumps({"session_id": session["id"], "events": len(events), "transport": "http" if args.direct else "mqtt"}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
