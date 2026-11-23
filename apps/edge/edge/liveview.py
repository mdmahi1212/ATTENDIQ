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
BODY = (230, 150, 40)  # BGR blue: body boxes (YOLO)


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


def draw_preview(frame: np.ndarray, faces: Sequence[FaceDet], bodies: Sequence[Box], text: str) -> np.ndarray:
    """Camera test without a class: what the models see (faces with detection / anti-spoof scores, bodies), no names:
    the class face list only reaches the laptop while a class is live."""
    import cv2

    out = draw_bodies(frame, bodies)
    for f in faces:
        x1, y1, x2, y2 = (int(v) for v in f.box)
        live = "" if f.live_score is None else f" | real {f.live_score:.2f}"
        colour = GREY if f.embedding is None else BODY
        cv2.rectangle(out, (x1, y1), (x2, y2), colour, 3)
        cv2.putText(out, f"face {f.det_score:.2f}{live}", (x1, max(20, y1 - 8)), cv2.FONT_HERSHEY_SIMPLEX, 0.7, colour, 2)
    _caption(out, text)
    return out


def caption_only(frame: np.ndarray, text: str) -> np.ndarray:
    """The camera picture with a caption only (camera test while no class is running)."""
    out = frame.copy()
    _caption(out, text)
    return out


def draw_bodies(frame: np.ndarray, boxes: Sequence[Box]) -> np.ndarray:
    """Thin blue body boxes under the face boxes (door camera)."""
    import cv2

    out = frame.copy()
    for b in boxes:
        x1, y1, x2, y2 = (int(v) for v in b)
        cv2.rectangle(out, (x1, y1), (x2, y2), BODY, 2)
        cv2.putText(out, "person", (x1 + 5, y2 - 8), cv2.FONT_HERSHEY_SIMPLEX, 0.6, BODY, 2)
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

PAGE = """<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AttendIQ live view</title>
<style>
*{box-sizing:border-box}html,body{height:100%}body{margin:0;font-family:system-ui,sans-serif;background:#0d0f14;color:#e8e8ee;display:flex;flex-direction:column}
header{display:flex;flex-wrap:wrap;align-items:center;gap:8px 16px;padding:6px 12px;background:#151821;border-bottom:1px solid #252a36}
header b{font-weight:600}.k{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:4px;vertical-align:-1px}
.legend{font-size:12px;color:#aab;display:flex;flex-wrap:wrap;gap:4px 12px}
.led{margin-left:auto;display:flex;align-items:center;gap:10px;font-size:13px}
.bulb{width:26px;height:26px;border-radius:50%;background:#333;box-shadow:inset 0 0 8px #000;transition:all .15s}
.bulb.green{background:#2ecc40;box-shadow:0 0 22px 6px #2ecc40aa}.bulb.red{background:#ff3b30;box-shadow:0 0 22px 6px #ff3b30aa}
.bulb.amber{background:#ffb000;box-shadow:0 0 22px 6px #ffb000aa}
main{flex:1;min-height:0;display:grid;gap:8px;padding:8px;grid-template-columns:1fr 1fr;grid-template-rows:1fr}
@media (max-aspect-ratio:1/1){main{grid-template-columns:1fr;grid-template-rows:1fr 1fr}}
main.big{grid-template-columns:1fr;grid-template-rows:1fr;position:relative}
main.big .cam.small{position:absolute;right:16px;bottom:16px;width:min(28vw,420px);height:auto;z-index:2;box-shadow:0 8px 30px #000a}
main.big .cam.small .bar{display:none}main.big .cam.small img{height:auto;max-height:30vh}
.layout{display:flex;gap:4px}.layout button{background:#252a36;color:#e8e8ee;border:0;border-radius:6px;padding:4px 9px;font-size:12px;cursor:pointer}
.layout button.on{background:#4f46e5}
.cam{position:relative;min-height:0;display:flex;flex-direction:column;background:#151821;border:1px solid #252a36;border-radius:12px;overflow:hidden}
.cam .bar{display:flex;align-items:center;gap:8px;padding:6px 10px;font-size:13px;color:#cfd2dc}
.cam .bar span{flex:1}.cam button{background:#252a36;color:#e8e8ee;border:0;border-radius:6px;padding:4px 9px;font-size:12px;cursor:pointer}
.cam button.on{background:#4f46e5}
.cam img{flex:1;min-height:0;width:100%;height:100%;object-fit:contain;background:#000;cursor:zoom-in}
.cam:fullscreen img{max-height:none;height:100%;cursor:zoom-out}
</style></head><body>
<header>
<b>AttendIQ live AI view</b><span style="font-size:12px;color:#889">local only, nothing is stored</span>
<div class="legend"><span><i class="k" style="background:#3cb43c"></i>recognised</span><span><i class="k" style="background:#dc2828"></i>unknown</span>
<span><i class="k" style="background:#e6a000"></i>left</span><span><i class="k" style="background:#969696"></i>too small</span>
<span><i class="k" style="background:#2896e6"></i>body</span></div>
<div class="layout" role="group" aria-label="Layout"><button id="l-both" class="on" type="button">Both</button>
<button id="l-door" type="button">Door big</button><button id="l-room" type="button">Room big</button></div>
<div class="led" title="Simulated ESP32 door LED (no board)"><div id="led" class="bulb"></div><span><b>Door LED</b> <span id="ledtxt">waiting</span></span></div>
</header>
<main>
<section class="cam" id="c-door"><div class="bar"><span>Door camera: faces (InsightFace) + bodies (YOLO)</span></div>
<img src="/gate.mjpg" alt="door camera" title="Click: full screen"></section>
<section class="cam" id="c-room"><div class="bar"><span id="roomcap">Room camera: bodies + count (YOLO)</span>
<button id="b-inside" class="on" type="button">Bodies</button><button id="b-exit" type="button">Faces / who leaves</button></div>
<img id="room" src="/inside.mjpg" alt="room camera" title="Click: full screen"></section>
</main>
<script>
const led=document.getElementById("led"),txt=document.getElementById("ledtxt");
const say={ok:"recognised (green)",unknown:"unknown face (red)",left:"someone left (amber)",off:"waiting"};
async function poll(){try{const r=await(await fetch("/led.json",{cache:"no-store"})).json();
led.className="bulb "+r.color;txt.textContent=r.last==="off"?"waiting":say[r.last]+" · "+r.seconds_ago+" s ago";}catch(e){}
setTimeout(poll,300);}poll();
const room=document.getElementById("room"),cap=document.getElementById("roomcap");
function show(which){room.src="/"+which+".mjpg";document.getElementById("b-inside").classList.toggle("on",which==="inside");
document.getElementById("b-exit").classList.toggle("on",which==="exit");
cap.textContent=which==="inside"?"Room camera: bodies + count (YOLO)":"Room camera: faces, who is in the room, who leaves";}
document.getElementById("b-inside").onclick=()=>show("inside");document.getElementById("b-exit").onclick=()=>show("exit");
const main=document.querySelector("main"),cd=document.getElementById("c-door"),cr=document.getElementById("c-room");
function layout(m){main.classList.toggle("big",m!=="both");cd.classList.toggle("small",m==="room");cr.classList.toggle("small",m==="door");
if(m==="room")main.append(cd);else main.prepend(cd);
for(const k of ["both","door","room"])document.getElementById("l-"+k).classList.toggle("on",k===m);try{localStorage.setItem("aiq-layout",m)}catch(e){}}
for(const k of ["both","door","room"])document.getElementById("l-"+k).onclick=()=>layout(k);
try{layout(localStorage.getItem("aiq-layout")||"both")}catch(e){layout("both")}
for(const img of document.querySelectorAll(".cam img")){img.onclick=()=>{const c=img.closest(".cam");
if(document.fullscreenElement)document.exitFullscreen();else c.requestFullscreen&&c.requestFullscreen();};}
</script></body></html>"""
