"""python -m edge [--video samples/walk.mp4] [--direct] [--presence]

Default: reads the gate camera from .env, publishes events over MQTT (SQLite outbox first).
--video FILE  play a recorded video instead of the live camera (real-time speed), exit at the end.
--demo --video door.mp4 --room-video room.mp4
              recorded-video class: wait until a class is live in the room (started on the website), play both
              recordings together in real time as the door and inside cameras, keep their last frames when they
              end, and exit when the class ends. Run it with scripts/run-video-demo.ps1.
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
from pathlib import Path
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
    ap.add_argument("--room-video", help="video file instead of the live inside camera (with --demo)")
    ap.add_argument("--demo", action="store_true",
                    help="recorded-video class: wait for a live session in the room, then play --video (door) and "
                         "--room-video (room) together in real time; exit when the session ends")
    ap.add_argument("--direct", action="store_true", help="POST events to the API instead of MQTT")
    ap.add_argument("--presence", action="store_true", help="entry_mode=presence (overrides config.yaml)")
    ap.add_argument("--rotate", type=int, choices=[0, 90, 180, 270], help="rotate gate frames clockwise (overrides config.yaml)")
    ap.add_argument("--no-inside", action="store_true", help="do not run the inside (occupancy) camera")
    ap.add_argument("--debug", action="store_true", help="write the annotated inside frame to data/inside-debug.jpg")
    args = ap.parse_args(argv)
    if args.demo and not args.video:
        ap.error("--demo needs --video (door recording)")

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
        if liveview:  # simulated ESP32 LED on the live view (there is no board)
            liveview.led(result)
        if result == "left":
            return  # the door LED firmware only knows ok / unknown
        if client and connected.is_set():
            client.publish(topics.feedback(room), json.dumps({"result": result}), qos=0)

    def server_now() -> datetime:
        """Local clock corrected by the measured offset to the server (a wrong laptop clock must not change statuses)."""
        return datetime.now(UTC) + timedelta(seconds=api.clock_offset)

    gallery = Gallery()
    liveview = None
    if cfg.liveview.enabled:
        from edge.liveview import LiveView

        liveview = LiveView(cfg.liveview.host, cfg.liveview.port, fps=cfg.liveview.fps)
        liveview.serve()
    gate = GatePipeline(gate_cfg, gallery, device_id, emit, feedback, clock=server_now)
    # Exit recognition on the inside camera: same gallery and the same "who is inside" memory as the gate.
    exit_gate: GatePipeline | None = None
    if cfg.exit.enabled:
        exit_gate = GatePipeline(cfg.exit.to_gate_config(cfg.gate), gallery, device_id, emit, feedback, clock=server_now,
                                 memory=gate.memory)
    body_exit = None
    if exit_gate and cfg.exit.body_tracking and cfg.exit.mode == "line" and cfg.inside.enabled:
        from edge.bodyexit import BodyExitTracker

        _eg = exit_gate
        body_exit = BodyExitTracker(cfg.exit.line_a, cfg.exit.line_b, cfg.exit.out_side, gallery, gate.memory,
                                    exit_gate.cfg.thresholds,
                                    lambda sid, payload: _eg.report_out(sid, payload, t=time.monotonic()))
    from edge.geometry_sync import SnapshotSender
    from edge.geometry_sync import apply as apply_geometry
    from edge.geometry_sync import plan as plan_geometry

    snaps = SnapshotSender(api.upload_snapshot)  # pictures for drawing the geometry on the website

    def sync_geometry() -> None:
        try:
            done = apply_geometry(plan_geometry(api.cameras()), cfg, gate, exit_gate, body_exit)
        except EdgeApiError as e:
            log.warning("camera geometry not loaded: %s", e)
            return
        if done:
            log.info("camera geometry from the website applied: %s", ", ".join(done))

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
                    if args.demo:
                        log.info("demo: the class has ended; stopping")
                        stop.set()
                gate.stop()
                if exit_gate:
                    exit_gate.stop()
                return
            try:
                data = api.gallery(session_id)
            except EdgeApiError as e:
                log.error("gallery fetch failed: %s", e)
                return
            gate.start(uuid.UUID(session_id), data)
            if exit_gate:
                exit_gate.session_id = gate.session_id  # gallery + memory are shared and were just reset by gate.start
                exit_gate.tracker.clear()
            if body_exit:
                body_exit.reset()
            if door_bodies:
                door_bodies.reset()
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
    camera = Camera("gate", str(resolve(source)) if args.video else source, on_camera, hold_last=args.demo)
    if not args.demo:  # demo: both recordings start together when the class goes live (main loop)
        camera.start()

    from edge.detector import InsightFaceDetector

    detector = InsightFaceDetector(resolve(env.insightface_home), cfg.gate.det_size, device=cfg.gate.device)
    detector_lock = threading.Lock()  # the gate loop and the exit loop share one InsightFace model

    def detect(frame: Any) -> list[Any]:
        with detector_lock:
            return detector(frame)

    log.info("detector ready on %s; room %s; source %s; mode %s; rotate %s", detector.device, room, source,
             gate_cfg.entry_mode, args.rotate if args.rotate is not None else cfg.gate.rotate)

    # One YOLO person model PER CAMERA: BoT-SORT keeps its body ids inside the model, so cameras must not share one.
    def new_yolo() -> Any:
        from edge.occupancy import YoloPersonDetector

        w = str(resolve(env.yolo_weights)) if resolve(env.yolo_weights).exists() else env.yolo_weights
        return YoloPersonDetector(w, cfg.inside.conf, cfg.inside.device)

    tracker_cfg = str(resolve(cfg.inside.body_tracker)) if cfg.inside.body_tracker else ""
    reid_failed: set[str] = set()

    def bodies_with_ids(model: Any, frame: Any, cam: str) -> tuple[list[Any], list[Any] | None]:
        """(boxes, ids) with BoT-SORT + ReID ids, or (boxes, None) when tracking is off / failed."""
        if tracker_cfg and cam not in reid_failed:
            try:
                tracked = model.track(frame, tracker_cfg)
                return [b for b, _ in tracked], [i for _, i in tracked]
            except Exception as e:  # noqa: BLE001 - fall back to plain detection, keep the camera running
                reid_failed.add(cam)
                log.warning("body re-identification off for the %s camera (%s); using box overlap", cam, e)
        return model(frame), None

    door_bodies = None
    if cfg.gate.body_tracking:
        from edge.bodyexit import DoorBodyWatcher

        door_bodies = DoorBodyWatcher(gate.report_unknown_entry, cfg.gate.body_min_s)

    def occupancy_loop(cam: Camera) -> None:
        from edge.occupancy import OccupancyCounter, annotate, in_roi

        yolo = new_yolo()
        counter = OccupancyCounter(cfg.inside.window, cfg.inside.stable_count_seconds)
        session_seen = None
        next_pub = next_count = 0.0
        sample = None
        period = min(cfg.inside.interval_s, liveview.period) if liveview else cfg.inside.interval_s
        if body_exit:
            period = min(period, 0.2)  # follow walking bodies: ~5 frames per second at least
        log.info("inside camera ready (%s), roi %s, %s on %s", env.inside_camera_source, cfg.inside.roi,
                 Path(env.yolo_weights).name, "GPU" if yolo.device != "cpu" else "CPU")
        while not stop.is_set():
            t = time.monotonic()
            if gate.session_id != session_seen:
                session_seen = gate.session_id
                counter.reset()
            _, frame, _ = cam.latest()
            if frame is not None and snaps.due("inside"):
                snaps.offer("inside", rotate_frame(frame, cfg.inside.rotate))
            if frame is not None and gate.session_id is not None:
                frame = rotate_frame(frame, cfg.inside.rotate)
                if body_exit:
                    boxes, ids = bodies_with_ids(yolo, frame, "room")
                    # all bodies, not only seated ones: people walking to the door leave the seat area
                    body_exit.update(boxes, frame.shape[1], frame.shape[0], time.monotonic(), ids)
                else:
                    boxes = yolo(frame)
                kept = in_roi(boxes, cfg.inside.roi, frame.shape[1], frame.shape[0])
                if t >= next_count or sample is None:
                    next_count = t + cfg.inside.interval_s
                    sample = counter.add(len(kept), t)
                    inside_stats.update(raw=sample.raw, smoothed=sample.smoothed, stable=sample.stable)
                if liveview:
                    from edge.liveview import draw_people

                    liveview.update("inside", draw_people(frame, boxes, kept, len(kept), Path(env.yolo_weights).stem))
                if args.debug:
                    import cv2

                    dbg = annotate(frame, boxes, kept, cfg.inside.roi, sample.smoothed)
                    cv2.imwrite(str(resolve("./data/inside-debug.jpg")), dbg)
                if t >= next_pub:
                    next_pub = t + cfg.inside.publish_s
                    emit(Envelope(event_type=EventType.OCCUPANCY_UPDATED, source_device_id=device_id, session_id=gate.session_id,
                                  observed_at=server_now(), model_version=Path(env.yolo_weights).stem,
                                  payload={"raw": sample.raw, "smoothed": sample.smoothed, "stable": sample.stable}))
            stop.wait(max(0.05, period - (time.monotonic() - t)))

    inside_stats: dict[str, Any] = {}

    def exit_loop(cam: Camera, pipeline: GatePipeline) -> None:
        log.info("exit recognition ready on the inside camera; line %s -> %s, out_side %s",
                 cfg.exit.line_a, cfg.exit.line_b, cfg.exit.out_side)
        last, k = -1, 0
        while not stop.is_set():
            seq, frame, _ = cam.latest()
            if frame is None or seq == last or pipeline.session_id is None:
                stop.wait(0.02)
                continue
            last, k = seq, k + 1
            if k % max(1, cfg.exit.process_every_nth):
                continue
            frame = rotate_frame(frame, cfg.inside.rotate)
            faces = detect(frame)
            now = time.monotonic()
            pipeline.process(faces, frame.shape[1], frame.shape[0], now)
            if body_exit:
                body_exit.faces(faces, now)
            if liveview and liveview.due("exit"):
                from edge.liveview import draw_faces

                img = draw_faces(frame, faces, gallery, pipeline.memory, pipeline.cfg.thresholds, "way-out camera")
                liveview.update("exit", img)

    # ------------------------------------------------------------ heartbeat + session poll
    def background() -> None:
        next_hb, next_poll, next_gallery = 0.0, 0.0, time.monotonic() + cfg.gallery_refresh_seconds
        next_geom = 0.0
        while not stop.is_set():
            now = time.monotonic()
            if now >= next_geom:
                next_geom = now + 60
                sync_geometry()
            if now >= next_poll:
                # demo: poll fast until the class is live, so the recordings start within ~2 s of the start
                next_poll = now + (2 if args.demo and gate.session_id is None else cfg.control_poll_seconds)
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
                    "clock_offset_s": round(off, 1), "inside": inside_stats,
                    "cpu": psutil.cpu_percent(), "fps": {"gate": round(camera.fps, 1)},
                    "frame_age_s": {"gate": None if age is None else round(age, 1)},
                    "outbox": outbox.pending_count(), "gallery": len(gallery),
                    "session_id": str(gate.session_id) if gate.session_id else None, "stats": gate.stats,
                    "exit_stats": exit_gate.stats if exit_gate else None}))
            stop.wait(0.5)

    threading.Thread(target=background, daemon=True, name="background").start()

    # ------------------------------------------------------------ inside camera (occupancy)
    inside_cam: Camera | None = None
    inside_source = str(resolve(args.room_video)) if args.room_video else env.inside_camera_source
    if (cfg.inside.enabled or exit_gate) and inside_source and not args.no_inside and (args.room_video or not args.video):
        inside_cam = Camera("inside", inside_source, on_camera, hold_last=args.demo)
        if not args.demo:
            inside_cam.start()
        if cfg.inside.enabled:  # people counting (off when the inside camera only watches the way out)
            threading.Thread(target=occupancy_loop, args=(inside_cam,), daemon=True, name="occupancy").start()
        if exit_gate:
            threading.Thread(target=exit_loop, args=(inside_cam, exit_gate), daemon=True, name="exit").start()

    rotation = args.rotate if args.rotate is not None else cfg.gate.rotate
    # ------------------------------------------------------------ main loop
    last_seq, n = -1, 0
    next_body, last_bodies, door_yolo = 0.0, [], None
    demo_started = False
    if args.demo:
        log.info("demo: waiting for a live class in room %s (start it on the website)", room)
    try:
        while not stop.is_set():
            if args.demo and not demo_started and gate.session_id is not None:
                demo_started = True
                for cam in (camera, inside_cam):
                    if cam:
                        cam.start()
                log.info("demo: class is live, playing the recordings")
            if args.video and camera.ended and not args.demo:
                time.sleep(2)  # let the last decisions publish
                break
            seq, frame, _ = camera.latest()
            if frame is not None and snaps.due("gate"):
                snaps.offer("gate", rotate_frame(frame, rotation))
            if frame is None or seq == last_seq or gate.session_id is None:
                time.sleep(0.01)
                continue
            last_seq = seq
            n += 1
            if n % max(1, cfg.gate.process_every_nth):
                continue
            frame = rotate_frame(frame, rotation)
            faces = detect(frame)
            now = time.monotonic()
            gate.process(faces, frame.shape[1], frame.shape[0], now)
            bodies: list[Any] = []
            if door_bodies and now >= next_body:
                next_body = now + 0.2  # bodies at ~5 fps are enough to follow a walk
                if door_yolo is None:
                    door_yolo = new_yolo()
                bodies, body_ids = bodies_with_ids(door_yolo, frame, "door")
                door_bodies.update(bodies, faces, now, body_ids)
                last_bodies = bodies
            if liveview and liveview.due("gate"):
                from edge.liveview import draw_bodies, draw_faces

                img = draw_bodies(frame, last_bodies) if door_bodies else frame
                liveview.update("gate", draw_faces(img, faces, gallery, gate.memory, gate.cfg.thresholds, "door camera"))
    except KeyboardInterrupt:
        pass
    finally:
        stop.set()
        camera.stop()
        if inside_cam:
            inside_cam.stop()
        if door_bodies:
            door_bodies.flush()  # someone still in view at shutdown with no face found
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
