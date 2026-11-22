# ruff: noqa: E501  (embedded HTML page)
"""Live labelled camera view for demos: http://127.0.0.1:8090 (local only, never stored).

Gate / exit streams: a box per face with the student's initials, match score and state (in class / left / unknown).
Inside stream: a box per person YOLO found and the count. Frames live in RAM only (latest JPEG per stream).
Virtual door LED (no ESP32 needed): /led returns the latest door result; the page lights green (recognised,
attendance recorded), red (unknown person) or amber (left the room) for 1.5 s, like firmware/esp32-door-led.
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


def led_for_event(env: object, gallery: Gallery) -> tuple[str, str] | None:
    """Virtual door LED for a published event: (colour, text), or None when the LED stays off."""
    et = getattr(getattr(env, "event_type", None), "value", "")
    payload: dict[str, object] = getattr(env, "payload", {}) or {}
    sid = payload.get("student_id")
    name = (gallery.students.get(str(sid)) if sid else None) or "student"
    if et == "GATE_ENTRY_RECOGNISED":
        return "green", f"{name}: attendance recorded"
    if et == "GATE_ENTRY_UNKNOWN":
        return "red", "unknown person at the door"
    if et == "GATE_PERSON_OUT" and sid:
        return "amber", f"{name} left the room"
    return None


def _caption(out: np.ndarray, text: str) -> None:
    import cv2

    cv2.rectangle(out, (0, 0), (out.shape[1], 34), (30, 30, 30), -1)
    cv2.putText(out, text, (10, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)


def draw_faces(frame: np.ndarray, faces: Sequence[FaceDet], gallery: Gallery, memory: SessionMemory,
               thr: Thresholds, title: str, line: tuple[tuple[float, float], tuple[float, float]] | None = None) -> np.ndarray:
    import cv2

    out = frame.copy()
    if line:  # the crossing line (normalised coords), so it can be checked against the doorway in the picture
        h, w = out.shape[:2]
        (ax, ay), (bx, by) = line
        cv2.line(out, (int(ax * w), int(ay * h)), (int(bx * w), int(by * h)), AMBER, 3)
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
        self._led: list[dict[str, object]] = []  # newest last; the page shows the latest + a short history
        self._led_seq = 0

    def led(self, colour: str, text: str) -> None:
        """Light the virtual door LED: colour is 'green', 'red' or 'amber'."""
        with self._lock:
            self._led_seq += 1
            self._led = [*self._led[-9:], {"seq": self._led_seq, "colour": colour, "text": text,
                                           "at": time.strftime("%H:%M:%S")}]

    def led_state(self) -> dict[str, object]:
        with self._lock:
            return {"events": list(self._led), "streams": sorted(self._jpeg)}

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
                if self.path == "/led":
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
.k{display:inline-block;width:10px;height:10px;border-radius:2px;margin:0 4px 0 12px}
.wrap{display:grid;grid-template-columns:1fr 260px;gap:12px;padding:0 16px 16px}@media(max-width:900px){.wrap{grid-template-columns:1fr}}
.grid{padding:0}.led{background:#1b1b1b;border-radius:8px;padding:16px;text-align:center;align-self:start}
.bulb{width:120px;height:120px;border-radius:50%;margin:12px auto;background:#2a2a2a;border:6px solid #333;transition:background .1s,box-shadow .1s}
.bulb.green{background:#33d65a;box-shadow:0 0 50px 12px #33d65a99}.bulb.red{background:#ff3b3b;box-shadow:0 0 50px 12px #ff3b3b99}
.bulb.amber{background:#ffb020;box-shadow:0 0 50px 12px #ffb02099}#ledtext{min-height:44px;font-size:15px}
.log{list-style:none;padding:0;margin:12px 0 0;text-align:left;font-size:13px;color:#bbb}.log li{padding:3px 0;border-top:1px solid #2a2a2a}
.dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px}
</style></head><body>
<h1>AttendIQ — live AI view (local only, nothing is stored)
<span class="k" style="background:#3cb43c"></span>recognised
<span class="k" style="background:#dc2828"></span>unknown
<span class="k" style="background:#e6a000"></span>left
<span class="k" style="background:#969696"></span>too small / not counted</h1>
<div class="wrap"><div class="grid">
<figure id="f-gate"><img src="/gate.mjpg" alt="door camera"><figcaption>Door camera: face detection + recognition (InsightFace)</figcaption></figure>
<figure id="f-inside"><img src="/inside.mjpg" alt="room camera"><figcaption>Room camera: people detection + count (YOLO)</figcaption></figure>
<figure id="f-exit"><img src="/exit.mjpg" alt="way-out camera"><figcaption>Way-out camera: recognising people who leave (if enabled)</figcaption></figure>
</div>
<aside class="led"><div style="font-size:14px;color:#aaa">Door LED (simulated ESP32)</div>
<div id="bulb" class="bulb"></div><div id="ledtext">waiting…</div>
<div style="font-size:12px;color:#888">green = recognised, attendance recorded · red = unknown · amber = left</div>
<ul id="log" class="log"></ul></aside></div>
<script>
const C={green:"#33d65a",red:"#ff3b3b",amber:"#ffb020"};let seen=0,off=null;
async function poll(){try{const r=await fetch("/led",{cache:"no-store"});const d=await r.json();const ev=d.events||[];
const st=d.streams||[];if(st.length){for(const n of ["gate","inside","exit"]){document.getElementById("f-"+n).style.display=st.includes(n)?"":"none"}}
const last=ev[ev.length-1];if(last&&last.seq>seen){const first=seen===0;seen=last.seq;if(!first){
const b=document.getElementById("bulb");b.className="bulb "+last.colour;document.getElementById("ledtext").textContent=last.text;
clearTimeout(off);off=setTimeout(()=>{b.className="bulb"},1500);}}
document.getElementById("log").innerHTML=ev.slice().reverse().map(e=>`<li><span class="dot" style="background:${C[e.colour]}"></span>${e.at} ${e.text.replace(/[<>&]/g,"")}</li>`).join("");
}catch(e){}setTimeout(poll,200)}poll();
</script></body></html>"""
