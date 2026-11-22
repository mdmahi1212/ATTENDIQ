# ruff: noqa: E501  (embedded HTML page)
"""Live labelled camera view for demos: http://127.0.0.1:8090 (local only, never stored).

Gate / exit streams: a box per face with the student's initials, match score and state (in class / left / unknown).
Inside stream: a box per person YOLO found and the count. Frames live in RAM only (latest JPEG per stream).
"""

from __future__ import annotations

import json
import logging
import threading
import time
from collections.abc import Sequence
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np

from edge.decision import SessionMemory, Thresholds
from edge.gallery import Gallery
from edge.gate import FaceDet
from edge.geometry import Box

log = logging.getLogger("edge.liveview")

GREEN, RED, GREY, AMBER = (60, 180, 60), (40, 40, 220), (150, 150, 150), (0, 160, 230)


def face_label(face: FaceDet, gallery: Gallery, memory: SessionMemory, thr: Thresholds) -> tuple[str, tuple[int, int, int]]:
    """Text + BGR colour for one face, using the same thresholds as the gate decision."""
    if face.embedding is None:
        return "face too small", GREY
    m = gallery.match(face.embedding)
    if not m.student_id or m.score < thr.accept or m.margin < thr.margin:
        return f"unknown {m.score:.2f}", RED
    who = gallery.students.get(m.student_id) or "student"
    state = "in class" if m.student_id in memory.inside else "left" if m.student_id in memory.left else "seen"
    return f"{who} {m.score:.2f} | {state}", GREEN if state != "left" else AMBER


def _caption(out: np.ndarray, text: str) -> None:
    import cv2

    cv2.rectangle(out, (0, 0), (out.shape[1], 34), (30, 30, 30), -1)
    cv2.putText(out, text, (10, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)


def draw_faces(frame: np.ndarray, faces: Sequence[FaceDet], gallery: Gallery, memory: SessionMemory,
               thr: Thresholds, title: str) -> np.ndarray:
    import cv2

    out = frame.copy()
    for f in faces:
        text, colour = face_label(f, gallery, memory, thr)
        x1, y1, x2, y2 = (int(v) for v in f.box)
        cv2.rectangle(out, (x1, y1), (x2, y2), colour, 3)
        (tw, th), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.7, 2)
        cv2.rectangle(out, (x1, max(0, y1 - th - 12)), (x1 + tw + 10, y1), colour, -1)
        cv2.putText(out, text, (x1 + 5, y1 - 6), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
    _caption(out, f"{title} | faces: {len(faces)} | InsightFace buffalo_l")
    return out


def draw_people(frame: np.ndarray, boxes: Sequence[Box], kept: Sequence[Box], count: int, model: str) -> np.ndarray:
    import cv2

    out = frame.copy()
    keep = set(kept)
    for i, b in enumerate(boxes, 1):
        colour = GREEN if b in keep else GREY
        x1, y1, x2, y2 = (int(v) for v in b)
        cv2.rectangle(out, (x1, y1), (x2, y2), colour, 3)
        cv2.putText(out, f"person {i}", (x1 + 5, y1 + 24), cv2.FONT_HERSHEY_SIMPLEX, 0.7, colour, 2)
    _caption(out, f"room camera | people counted: {count} | {model}")
    return out


class LiveView:
    """Latest JPEG per stream + a tiny MJPEG web server (127.0.0.1 only by default)."""

    def __init__(self, host: str = "127.0.0.1", port: int = 8090, max_width: int = 960, fps: float = 10.0) -> None:
        self.host, self.port, self.max_width, self.period = host, port, max_width, 1.0 / fps
        self._jpeg: dict[str, bytes] = {}
        self._last: dict[str, float] = {}
        self._lock = threading.Lock()
        self._led: tuple[str, float] = ("off", time.monotonic())  # simulated ESP32 door LED: last result + when (monotonic)

    def led(self, result: str) -> None:
        """Simulated ESP32 door LED: ok = green, unknown = red, left = amber (lit for LED_ON_S like the firmware)."""
        with self._lock:
            self._led = (result, time.monotonic())

    def led_state(self) -> dict[str, object]:
        with self._lock:
            result, at = self._led
        age = time.monotonic() - at
        lit = result != "off" and age < LED_ON_S
        return {"color": LED_COLORS.get(result, "off") if lit else "off", "last": result, "seconds_ago": round(age, 1)}

    def due(self, name: str) -> bool:
        """True when this stream should get a new frame (keeps drawing + encoding at ~fps)."""
        return time.monotonic() - self._last.get(name, 0.0) >= self.period

    def update(self, name: str, frame: np.ndarray) -> None:
        import cv2

        h, w = frame.shape[:2]
        if w > self.max_width:
            frame = cv2.resize(frame, (self.max_width, int(h * self.max_width / w)))
        ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 75])
        if ok:
            with self._lock:
                self._jpeg[name] = buf.tobytes()
                self._last[name] = time.monotonic()

    def latest(self, name: str) -> bytes | None:
        with self._lock:
            return self._jpeg.get(name)

    def clear(self) -> None:
        with self._lock:
            self._jpeg.clear()

    def serve(self) -> None:
        view = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_: object) -> None:  # quiet
                return

            def do_GET(self) -> None:  # noqa: N802 - http.server API
                if self.path in ("/", "/index.html"):
                    body = PAGE.encode()
                    self.send_response(200)
                    self.send_header("Content-Type", "text/html; charset=utf-8")
                    self.send_header("Content-Length", str(len(body)))
                    self.end_headers()
                    self.wfile.write(body)
                    return
                if self.path == "/led.json":
                    body = json.dumps(view.led_state()).encode()
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Cache-Control", "no-store")
                    self.send_header("Content-Length", str(len(body)))
                    self.end_headers()
                    self.wfile.write(body)
                    return
                name = self.path.strip("/").removesuffix(".mjpg")
                if name not in ("gate", "inside", "exit"):
                    self.send_error(404)
                    return
                self.send_response(200)
                self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=frame")
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                try:
                    while True:
                        jpg = view.latest(name) or WAITING
                        self.wfile.write(b"--frame\r\nContent-Type: image/jpeg\r\nContent-Length: %d\r\n\r\n" % len(jpg))
                        self.wfile.write(jpg + b"\r\n")
                        time.sleep(view.period)
                except (ConnectionError, OSError):
                    return

        server = ThreadingHTTPServer((self.host, self.port), Handler)
        server.daemon_threads = True
        threading.Thread(target=server.serve_forever, daemon=True, name="liveview").start()
        log.info("live view: http://%s:%d", self.host, self.port)


LED_ON_S = 1.5  # firmware/esp32-door-led keeps the LED on for 1.5 s
LED_COLORS = {"ok": "green", "unknown": "red", "left": "amber"}


def _waiting_jpeg() -> bytes:
    import cv2

    img = np.full((270, 480, 3), 40, np.uint8)
    cv2.putText(img, "waiting for a live class...", (40, 140), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (220, 220, 220), 2)
    return cv2.imencode(".jpg", img)[1].tobytes()


WAITING = _waiting_jpeg()

PAGE = """<!doctype html><html><head><meta charset="utf-8"><title>AttendIQ live view</title>
<style>body{margin:0;font-family:system-ui,sans-serif;background:#111;color:#eee}
h1{font-size:18px;font-weight:500;margin:12px 16px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(420px,1fr));gap:12px;padding:0 16px 16px}
figure{margin:0}img{width:100%;border-radius:8px;background:#222}figcaption{font-size:13px;color:#aaa;margin:6px 2px}
.box{display:flex;gap:16px;align-items:center;background:#1b1b1b;border-radius:8px;padding:20px;min-height:120px}
.bulb{width:72px;height:72px;border-radius:50%;background:#333;box-shadow:inset 0 0 12px #000;transition:all .15s}
.bulb.green{background:#2ecc40;box-shadow:0 0 36px 10px #2ecc40aa}.bulb.red{background:#ff3b30;box-shadow:0 0 36px 10px #ff3b30aa}
.bulb.amber{background:#ffb000;box-shadow:0 0 36px 10px #ffb000aa}
.k{display:inline-block;width:10px;height:10px;border-radius:2px;margin:0 4px 0 12px}
</style></head><body>
<h1>AttendIQ — live AI view (local only, nothing is stored)
<span class="k" style="background:#3cb43c"></span>recognised
<span class="k" style="background:#dc2828"></span>unknown
<span class="k" style="background:#e6a000"></span>left
<span class="k" style="background:#969696"></span>too small / not counted</h1>
<div class="grid">
<figure><img src="/gate.mjpg" alt="door camera"><figcaption>Door camera: face detection + recognition (InsightFace)</figcaption></figure>
<figure><img src="/inside.mjpg" alt="room camera"><figcaption>Room camera: people detection + count (YOLO)</figcaption></figure>
<figure><img src="/exit.mjpg" alt="way-out camera"><figcaption>Way-out camera: recognising people who leave (if enabled)</figcaption></figure>
<figure class="led"><div class="box"><div id="led" class="bulb"></div><div><b>ESP32 door LED</b> (simulated, no board)<br>
<span id="ledtxt">waiting</span></div></div><figcaption>Green = recognised at the door · Red = unknown face · Amber = someone left</figcaption></figure>
</div>
<script>
const led=document.getElementById("led"),txt=document.getElementById("ledtxt");
const say={ok:"recognised - door LED green",unknown:"unknown face - door LED red",left:"someone left - LED amber",off:"waiting"};
async function poll(){try{const r=await(await fetch("/led.json",{cache:"no-store"})).json();
led.className="bulb "+r.color;txt.textContent=r.last==="off"?"waiting":say[r.last]+" ("+r.seconds_ago+" s ago)";}catch(e){}
setTimeout(poll,250);}poll();
</script></body></html>"""
