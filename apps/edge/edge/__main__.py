"""python -m edge [--video samples/walk.mp4] [--direct] [--presence]

Default: reads the gate camera from .env, publishes events over MQTT (SQLite outbox first).
--video FILE  play a recorded video instead of the live camera (real-time speed), exit at the end.
--direct      POST events straight to the web API instead of MQTT (no broker needed; still uses the outbox).
"""

from __future__ import annotations

import argparse
import json
import logging
import ssl
import threading
import time
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import psutil

from attendiq_common import topics
from attendiq_common.api import EdgeApi, EdgeApiError
from attendiq_common.envelope import Envelope, EventType
from edge.camera import Camera, rotate_frame
from edge.config import Env, load_yaml, resolve
from edge.gallery import Gallery
from edge.gate import GatePipeline
from edge.outbox import Outbox, Publisher

log = logging.getLogger("edge")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="edge")
    ap.add_argument("--video", help="video file instead of the live gate camera")
    ap.add_argument("--direct", action="store_true", help="POST events to the API instead of MQTT")
    ap.add_argument("--presence", action="store_true", help="entry_mode=presence (overrides config.yaml)")
    ap.add_argument("--rotate", type=int, choices=[0, 90, 180, 270], help="rotate gate frames clockwise (overrides config.yaml)")
    args = ap.parse_args(argv)

    env = Env()  # type: ignore[call-arg]
    cfg = load_yaml(env.edge_config_path)
    fmt = '{"t":"%(asctime)s","lvl":"%(levelname)s","log":"%(name)s","msg":"%(message)s"}'
    logging.basicConfig(level=env.log_level, format=fmt)
    room = cfg.room_code or env.room_code
    device_id = uuid.UUID(env.edge_device_id)
    api = EdgeApi(env.api_base_url, env.edge_device_key)
    gate_cfg = cfg.gate.to_gate_config()
    if args.presence:
        from dataclasses import replace

        gate_cfg = replace(gate_cfg, entry_mode="presence")

    outbox = Outbox(resolve(env.outbox_path))
    stop = threading.Event()
    connected = threading.Event()

    # ------------------------------------------------------------ transport
    client = None
    if args.direct:
        def send(topic: str, body: str) -> int | None:
            try:
                api.post_events([json.loads(body)])
            except EdgeApiError as e:
                log.warning("direct post failed (%s); kept in outbox", e)
                return None
            publisher.outbox.mark_sent(json.loads(body)["event_id"])
            return None
    else:
        import paho.mqtt.client as mqtt

        client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=env.mqtt_client_id, clean_session=False)
        if env.mqtt_username:
            client.username_pw_set(env.mqtt_username, env.mqtt_password)
        if env.mqtt_tls:
            client.tls_set(ca_certs=env.mqtt_ca_file or None, tls_version=ssl.PROTOCOL_TLS_CLIENT)
        client.reconnect_delay_set(1, 30)

        def send(topic: str, body: str) -> int | None:
            if not connected.is_set():
                return None
            info = client.publish(topic, body, qos=1)
            return info.mid if info.rc == 0 else None

    publisher = Publisher(outbox, send)

    def emit(env_: Envelope) -> None:
        publisher.publish(topics.for_event(room, env_.event_type), env_)
        log.info("event %s %s", env_.event_type, json.dumps(env_.payload))

    def feedback(result: str) -> None:
        if client and connected.is_set():
            client.publish(topics.feedback(room), json.dumps({"result": result}), qos=0)

    def server_now() -> datetime:
        """Local clock corrected by the measured offset to the server (a wrong laptop clock must not change statuses)."""
        return datetime.now(UTC) + timedelta(seconds=api.clock_offset)

    gallery = Gallery()
    gate = GatePipeline(gate_cfg, gallery, device_id, emit, feedback, clock=server_now)
    session_lock = threading.Lock()

    def set_session(session_id: str | None, reason: str) -> None:
        with session_lock:
            current = str(gate.session_id) if gate.session_id else None
            if session_id == current and reason != "reload":
                return
            if reason == "reload" and session_id == current:
                try:
                    gate.reload_gallery(api.gallery(session_id))
                except EdgeApiError as e:
                    log.warning("gallery refresh failed: %s", e)
                    return
                log.info("gallery refreshed: %d students", len(gallery))
                return
            if not session_id:
                if current:
                    log.info("session stop (%s)", reason)
                gate.stop()
                return
            try:
                data = api.gallery(session_id)
            except EdgeApiError as e:
                log.error("gallery fetch failed: %s", e)
                return
            gate.start(uuid.UUID(session_id), data)
            log.info("session %s (%s): gallery %d students", session_id, reason, len(gallery))

    if client:
        def on_connect(c: Any, _u: Any, _f: Any, rc: Any, _p: Any) -> None:
            if rc.is_failure:
                log.error("mqtt connect failed: %s", rc)
                return
            connected.set()
            c.subscribe(topics.control(room), qos=1)
            n = publisher.replay()
            log.info("mqtt connected; replaying %d unsent events", n)

        def on_disconnect(*_: Any) -> None:
            connected.clear()
            log.warning("mqtt disconnected")

        def on_publish(_c: Any, _u: Any, mid: int, _rc: Any, _p: Any) -> None:
            publisher.on_puback(mid)

        def on_message(_c: Any, _u: Any, msg: Any) -> None:
            try:
                cmd = json.loads(msg.payload)
            except ValueError:
                return
            log.info("control %s", cmd)
            if cmd.get("cmd") == "start":
                set_session(cmd.get("session_id"), "control")
            elif cmd.get("cmd") == "stop":
                set_session(None, "control")
            elif cmd.get("cmd") == "reload_gallery" and gate.session_id:
                set_session(str(gate.session_id), "reload")

        client.on_connect, client.on_disconnect = on_connect, on_disconnect
        client.on_publish, client.on_message = on_publish, on_message
        client.connect_async(env.mqtt_host, env.mqtt_port, keepalive=30)
        client.loop_start()

    # ------------------------------------------------------------ camera
    def on_camera(name: str, online: bool, failures: int) -> None:
        et = EventType.CAMERA_ONLINE if online else EventType.CAMERA_OFFLINE
        emit(Envelope(event_type=et, source_device_id=device_id, session_id=gate.session_id, observed_at=server_now(),
                      payload={"camera": name, "failures": failures}))

    source = args.video or env.gate_camera_source
    camera = Camera("gate", str(resolve(source)) if args.video else source, on_camera)
    camera.start()

    from edge.detector import InsightFaceDetector

    detector = InsightFaceDetector(resolve(env.insightface_home), cfg.gate.det_size)
    log.info("detector ready; room %s; source %s; mode %s; rotate %s", room, source, gate_cfg.entry_mode,
             args.rotate if args.rotate is not None else cfg.gate.rotate)

    # ------------------------------------------------------------ heartbeat + session poll
    def background() -> None:
        next_hb, next_poll, next_gallery = 0.0, 0.0, time.monotonic() + cfg.gallery_refresh_seconds
        while not stop.is_set():
            now = time.monotonic()
            if now >= next_poll:
                next_poll = now + cfg.control_poll_seconds
                try:
                    s = api.current_session(room)
                    set_session(str(s["id"]) if s else None, "poll")
                except EdgeApiError as e:
                    log.warning("session poll failed: %s", e)
                if args.direct:
                    publisher.replay()
            if now >= next_gallery:
                next_gallery = now + cfg.gallery_refresh_seconds
                if gate.session_id:
                    set_session(str(gate.session_id), "reload")
            if now >= next_hb:
                next_hb = now + cfg.heartbeat_seconds
                age = camera.frame_age()
                off = api.clock_offset
                if abs(off) > 5:
                    log.warning("laptop clock is %.0f s %s server time: sync Windows time (timestamps are corrected)",
                                abs(off), "behind" if off > 0 else "ahead of")
                emit(Envelope(event_type=EventType.EDGE_HEARTBEAT, source_device_id=device_id, observed_at=server_now(), payload={
                    "clock_offset_s": round(off, 1),
                    "cpu": psutil.cpu_percent(), "fps": {"gate": round(camera.fps, 1)},
                    "frame_age_s": {"gate": None if age is None else round(age, 1)},
                    "outbox": outbox.pending_count(), "gallery": len(gallery),
                    "session_id": str(gate.session_id) if gate.session_id else None, "stats": gate.stats}))
            stop.wait(0.5)

    threading.Thread(target=background, daemon=True, name="background").start()

    rotation = args.rotate if args.rotate is not None else cfg.gate.rotate
    # ------------------------------------------------------------ main loop
    last_seq, n = -1, 0
    try:
        while not stop.is_set():
            if args.video and camera.ended:
                time.sleep(2)  # let the last decisions publish
                break
            seq, frame, _ = camera.latest()
            if frame is None or seq == last_seq or gate.session_id is None:
                time.sleep(0.01)
                continue
            last_seq = seq
            n += 1
            if n % max(1, cfg.gate.process_every_nth):
                continue
            frame = rotate_frame(frame, rotation)
            faces = detector(frame)
            gate.process(faces, frame.shape[1], frame.shape[0], time.monotonic())
    except KeyboardInterrupt:
        pass
    finally:
        stop.set()
        camera.stop()
        for tr in gate.tracker.clear():  # decide tracks still open at shutdown
            if tr.direction == "in" and not tr.decided:
                gate._decide(tr)
        if args.direct:
            publisher.replay()
        if client:
            time.sleep(1)
            client.loop_stop()
            client.disconnect()
        log.info("stopped; stats %s; unsent %d", json.dumps(gate.stats), outbox.pending_count())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
