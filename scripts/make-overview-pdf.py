"""Builds docs/AttendIQ-Project-Overview.pdf: architecture diagrams, progress and remaining work.

Run: python scripts/make-overview-pdf.py   (needs reportlab + Pillow)
"""

from __future__ import annotations

from pathlib import Path

from reportlab.graphics.shapes import Drawing, Line, Polygon, Rect, String
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Image,
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "AttendIQ-Project-Overview.pdf"
SHOTS = ROOT / "docs" / "screenshots"
W = A4[0] - 36 * mm  # content width

# ---------------------------------------------------------------- palette
INK = colors.HexColor("#1f2937")
MUTED = colors.HexColor("#6b7280")
LINE = colors.HexColor("#d1d5db")
BRAND = colors.HexColor("#1d4ed8")
DONE = colors.HexColor("#16a34a")
NEXT = colors.HexColor("#d97706")
TODO = colors.HexColor("#9ca3af")
LAYER = {
    "dev": (colors.HexColor("#ecfeff"), colors.HexColor("#0e7490")),
    "edge": (colors.HexColor("#fff7ed"), colors.HexColor("#c2410c")),
    "cloud": (colors.HexColor("#eff6ff"), colors.HexColor("#1d4ed8")),
    "app": (colors.HexColor("#f5f3ff"), colors.HexColor("#6d28d9")),
}

ss = getSampleStyleSheet()
H1 = ParagraphStyle("h1", parent=ss["Heading1"], fontSize=17, textColor=INK, spaceAfter=6, spaceBefore=4)
H2 = ParagraphStyle("h2", parent=ss["Heading2"], fontSize=12.5, textColor=BRAND, spaceAfter=4, spaceBefore=8)
BODY = ParagraphStyle("body", parent=ss["BodyText"], fontSize=9.6, leading=13.2, textColor=INK)
SMALL = ParagraphStyle("small", parent=BODY, fontSize=8.4, leading=11, textColor=MUTED)
CELL = ParagraphStyle("cell", parent=BODY, fontSize=8.4, leading=10.6)
CAP = ParagraphStyle("cap", parent=SMALL, alignment=TA_CENTER, spaceBefore=3)


# ---------------------------------------------------------------- drawing helpers
def arrow(d: Drawing, x1: float, y1: float, x2: float, y2: float, color=INK, label: str = "", lx: float = 0, ly: float = 0,
          dash: bool = False, size: float = 5) -> None:
    ln = Line(x1, y1, x2, y2, strokeColor=color, strokeWidth=1.1)
    if dash:
        ln.strokeDashArray = [3, 2]
    d.add(ln)
    import math

    a = math.atan2(y2 - y1, x2 - x1)
    p1 = (x2 - size * math.cos(a - 0.45), y2 - size * math.sin(a - 0.45))
    p2 = (x2 - size * math.cos(a + 0.45), y2 - size * math.sin(a + 0.45))
    d.add(Polygon([x2, y2, *p1, *p2], fillColor=color, strokeColor=color, strokeWidth=0.5))
    if label:
        d.add(String((x1 + x2) / 2 + lx, (y1 + y2) / 2 + ly, label, fontName="Helvetica-Oblique", fontSize=6.6,
                     fillColor=MUTED, textAnchor="middle"))


def box(d: Drawing, x: float, y: float, w: float, h: float, title: str, lines: list[str], kind: str,
        status: str | None = None) -> None:
    fill, stroke = LAYER[kind]
    d.add(Rect(x, y, w, h, rx=5, ry=5, fillColor=fill, strokeColor=stroke, strokeWidth=1))
    d.add(String(x + w / 2, y + h - 12, title, fontName="Helvetica-Bold", fontSize=7.8, fillColor=stroke, textAnchor="middle"))
    for i, t in enumerate(lines):
        d.add(String(x + w / 2, y + h - 23 - i * 9, t, fontName="Helvetica", fontSize=6.6, fillColor=INK, textAnchor="middle"))
    if status:
        c = {"done": DONE, "next": NEXT, "todo": TODO}[status]
        d.add(Rect(x + w - 9, y + h - 9, 6, 6, rx=3, ry=3, fillColor=c, strokeColor=c))


def band(d: Drawing, y: float, h: float, label: str, sub: str, kind: str) -> None:
    fill, stroke = LAYER[kind]
    d.add(Rect(0, y, W, h, fillColor=colors.white, strokeColor=LINE, strokeWidth=0.6, strokeDashArray=[2, 2]))
    d.add(Rect(0, y, 58, h, fillColor=fill, strokeColor=None))
    d.add(String(29, y + h / 2 + 3, label, fontName="Helvetica-Bold", fontSize=7.4, fillColor=stroke, textAnchor="middle"))
    d.add(String(29, y + h / 2 - 7, sub, fontName="Helvetica", fontSize=6.2, fillColor=MUTED, textAnchor="middle"))


def legend(d: Drawing, x: float, y: float) -> None:
    for i, (c, t) in enumerate([(DONE, "built + tested"), (NEXT, "next phase"), (TODO, "planned")]):
        d.add(Rect(x + i * 82, y, 7, 7, rx=3.5, ry=3.5, fillColor=c, strokeColor=c))
        d.add(String(x + i * 82 + 11, y + 1, t, fontName="Helvetica", fontSize=7, fillColor=MUTED))


# ---------------------------------------------------------------- diagrams
def architecture() -> Drawing:
    H = 392
    d = Drawing(W, H)
    rows = {"app": (300, 80), "cloud": (200, 88), "edge": (92, 96), "dev": (0, 80)}
    band(d, *rows["app"], "APPS", "L6-L7", "app")
    band(d, *rows["cloud"], "CLOUD", "L4-L6", "cloud")
    band(d, *rows["edge"], "EDGE", "L3 (fog)", "edge")
    band(d, *rows["dev"], "DEVICES", "L1-L2", "dev")
    x0, gap = 66, 8
    bw = (W - x0 - 3 * gap - 4) / 4

    def col(i: int) -> float:
        return x0 + i * (bw + gap)

    # apps (Vercel)
    ay, ah = rows["app"][0] + 8, 60
    box(d, col(0), ay, bw, ah, "Admin portal", ["courses, rooms, timetable", "people, enrollments", "face review queue"], "app", "done")
    box(d, col(1), ay, bw, ah, "Professor dashboard", ["live roster + counts", "mismatch, recheck", "manual edits (audited)"], "app", "todo")
    box(d, col(2), ay, bw, ah, "Student PWA", ["face enrollment + liveness", "self-verify, history", "appeals, inbox"], "app", "done")
    box(d, col(3), ay, bw, ah, "Web Push (VAPID)", ["DB webhook -> Node route", "-> FCM -> phone", "Realtime inbox fallback"], "app", "done")
    d.add(String(W - 4, rows["app"][0] + rows["app"][1] - 9, "Next.js on Vercel", fontName="Helvetica-Oblique", fontSize=6.6,
                 fillColor=MUTED, textAnchor="end"))
    # cloud (Supabase)
    cy, ch = rows["cloud"][0] + 8, 66
    box(d, col(0), cy, bw, ch, "Postgres + RLS", ["31 tables, RLS on all", "audit log by trigger", "Auth (roles)"], "cloud", "done")
    box(d, col(1), cy, bw, ch, "pgvector faces", ["512-d embeddings", "HNSW cosine index", "duplicate check"], "cloud", "done")
    box(d, col(2), cy, bw, ch, "Rule engine", ["pg_cron: session_tick()", "every minute: start,", "mismatch, finalize"], "cloud", "done")
    box(d, col(3), cy, bw, ch, "Realtime + Storage", ["live table changes", "private buckets", "(review thumbnails)"], "cloud", "done")
    d.add(String(W - 4, rows["cloud"][0] + rows["cloud"][1] - 9, "Supabase", fontName="Helvetica-Oblique", fontSize=6.6,
                 fillColor=MUTED, textAnchor="end"))
    # edge laptop
    ey, eh = rows["edge"][0] + 8, 66
    box(d, col(0), ey, bw, eh, "Gate pipeline", ["InsightFace detect + ArcFace", "track, line-cross, vote", "-> present / late"], "edge", "next")
    box(d, col(1), ey, bw, eh, "Occupancy pipeline", ["YOLOv8n person count", "seat ROI, median filter", "-> count C"], "edge", "todo")
    box(d, col(2), ey, bw, eh, "MQTT + ingest", ["Mosquitto broker", "offline SQLite queue", "ingest -> HTTPS (device key)"], "edge", "next")
    box(d, col(3), ey, bw, eh, "Face API", ["FastAPI + InsightFace", "images in -> embeddings", "Cloudflare Tunnel"], "edge", "done")
    d.add(String(W - 4, rows["edge"][0] + rows["edge"][1] - 9, "classroom laptop", fontName="Helvetica-Oblique", fontSize=6.6,
                 fillColor=MUTED, textAnchor="end"))
    # devices
    dy, dh = rows["dev"][0] + 8, 56
    box(d, col(0), dy, bw, dh, "Gate camera", ["phone #1 (IP Webcam)", "MJPEG over Wi-Fi"], "dev", "next")
    box(d, col(1), dy, bw, dh, "Inside camera", ["laptop webcam", "or phone #2"], "dev", "todo")
    box(d, col(2), dy, bw, dh, "ESP32 door LED", ["green = recognised", "red = unknown (MQTT)"], "dev", "todo")
    box(d, col(3), dy, bw, dh, "Student phones", ["run the Student PWA", "(HTTPS): camera, GPS,", "room QR, push"], "dev", "done")

    cx = [col(i) + bw / 2 for i in range(4)]
    # devices -> edge
    arrow(d, cx[0], dy + dh, cx[0], ey, label="video frames", lx=-26)
    arrow(d, cx[1], dy + dh, cx[1], ey, label="frames", lx=-18)
    arrow(d, cx[2] - 18, ey, cx[2] - 18, dy + dh, label="LED cmd", lx=-20, dash=True)
    # edge -> cloud
    arrow(d, cx[2], ey + eh, cx[2], cy, label="events (no video)", lx=-34)
    arrow(d, col(0) + bw, ey + 33, col(1), ey + 33)
    arrow(d, col(1) + bw, ey + 33, col(2), ey + 33)
    # apps <-> cloud
    arrow(d, cx[1], cy + ch, cx[1], ay, label="Realtime", lx=18)
    arrow(d, cx[0], ay, cx[0], cy + ch, label="queries (RLS)", lx=-26)
    arrow(d, cx[3], cy + ch, cx[3], ay, label="notify -> push", lx=-26)
    # app server -> face api
    gx = col(3) - gap / 2
    orange = colors.HexColor("#c2410c")
    d.add(Line(col(2) + bw - 14, ay, col(2) + bw - 14, ay - 10, strokeColor=orange, strokeWidth=1.1))
    d.add(Line(col(2) + bw - 14, ay - 10, gx, ay - 10, strokeColor=orange, strokeWidth=1.1))
    d.add(Line(gx, ay - 10, gx, ey + eh + 10, strokeColor=orange, strokeWidth=1.1))
    d.add(Line(gx, ey + eh + 10, col(3) + 14, ey + eh + 10, strokeColor=orange, strokeWidth=1.1))
    arrow(d, col(3) + 14, ey + eh + 10, col(3) + 14, ey + eh, color=orange, size=4)
    d.add(String(col(2) + bw - 18, ay - 8, "enroll / verify photos", fontName="Helvetica-Oblique", fontSize=6.4,
                 fillColor=orange, textAnchor="end"))
    legend(d, 66, H - 9)
    return d


def enrollment_flow() -> Drawing:
    H = 112
    d = Drawing(W, H)
    d.translate(0, 4)
    steps = [
        ("1 Consent", ["versioned text", "stored + withdrawable"], "app"),
        ("2 Liveness", ["3 random of: blink,", "turn L/R, smile"], "app"),
        ("3 Auto-capture", ["10 photos: front, left,", "right, up, down"], "app"),
        ("4 Face API", ["1 face, size, blur,", "score -> 512-d vector"], "edge"),
        ("5 Checks", ["outlier removal,", "duplicate (> 0.60)"], "cloud"),
        ("6 Store", ["active, or review", "+ admin thumbnail"], "cloud"),
    ]
    n = len(steps)
    gap = 10
    bw = (W - gap * (n - 1)) / n
    for i, (t, ls, k) in enumerate(steps):
        x = i * (bw + gap)
        box(d, x, 46, bw, 54, t, ls, k)
        if i < n - 1:
            arrow(d, x + bw + 1, 73, x + bw + gap - 1, 73, size=4)
    d.add(String(0, 30, "Measured on the real phone (production, 18 Nov 2026):", fontName="Helvetica-Bold", fontSize=7.6, fillColor=INK))
    d.add(String(0, 19, "Own account: 10 photos -> 9 accepted -> ACTIVE (9 embeddings, all 5 poses).", fontName="Helvetica",
                 fontSize=7.4, fillColor=INK))
    d.add(String(0, 9, "Second account with the same face: 10/10 accepted -> flagged REVIEW for the admin (similarity 0.90).",
                 fontName="Helvetica", fontSize=7.4, fillColor=INK))
    d.add(String(0, -2, "Steps 1-3 run in the phone browser (MediaPipe Face Landmarker). Photos are not kept; only the vectors.",
                 fontName="Helvetica", fontSize=7.4, fillColor=MUTED))
    return d


def class_timeline() -> Drawing:
    H = 112
    d = Drawing(W, H)
    y = 80
    d.add(Line(0, y, W, y, strokeColor=INK, strokeWidth=1.4))
    marks = [
        (1 / 12, "T0 - 10 min", "session goes live,", "rows set 'pending'"),
        (3 / 12, "T0 .. T0 + 10", "gate camera marks", "present / late"),
        (5 / 12, "T0 + 10, every 5'", "count C > verified V", "-> push 'verify now'"),
        (7 / 12, "on the phone", "face + liveness +", "room QR + GPS"),
        (9 / 12, "T_end - 10 min", "recount: C < V", "-> recheck all"),
        (11 / 12, "T_end", "finalize: no re-verify", "-> 'left early'"),
    ]
    for f, t, a, b in marks:
        x = f * W
        d.add(Rect(x - 3.5, y - 3.5, 7, 7, rx=3.5, ry=3.5, fillColor=BRAND, strokeColor=BRAND))
        anchor = "middle"
        d.add(String(x, y + 12, t, fontName="Helvetica-Bold", fontSize=7.4, fillColor=BRAND, textAnchor=anchor))
        d.add(String(x, y - 16, a, fontName="Helvetica", fontSize=6.9, fillColor=INK, textAnchor=anchor))
        d.add(String(x, y - 26, b, fontName="Helvetica", fontSize=6.9, fillColor=INK, textAnchor=anchor))
    d.add(String(0, 30, "The rule: never trust one signal. Gate camera = WHO entered. Inside camera = HOW MANY are there.",
                 fontName="Helvetica-Bold", fontSize=7.8, fillColor=INK))
    d.add(String(0, 18, "Student phone = identity + location proof. Attendance is final when they agree, or a professor overrides "
                 "(logged with a reason).", fontName="Helvetica", fontSize=7.6, fillColor=INK))
    d.add(String(0, 6, "If the gate camera was offline, finalize gives 'pending' (not 'absent'), so nobody is punished for a "
                 "hardware fault.", fontName="Helvetica", fontSize=7.6, fillColor=MUTED))
    return d


def progress_bar() -> Drawing:
    d = Drawing(W, 40)
    phases = ["0", "1", "2", "3", "4", "5", "6", "7", "8"]
    state = ["done"] * 5 + ["next"] + ["todo"] * 3
    seg = W / len(phases)
    for i, (p, s) in enumerate(zip(phases, state, strict=True)):
        c = {"done": DONE, "next": NEXT, "todo": colors.HexColor("#e5e7eb")}[s]
        d.add(Rect(i * seg + 1, 14, seg - 2, 16, fillColor=c, strokeColor=None))
        d.add(String(i * seg + seg / 2, 19, f"Phase {p}", fontName="Helvetica-Bold", fontSize=7.4,
                     fillColor=colors.white if s != "todo" else MUTED, textAnchor="middle"))
    d.add(String(0, 2, "5 of 9 phases done (each one closed by a tested gate)  |  Phase 5 next", fontName="Helvetica",
                 fontSize=7.6, fillColor=MUTED))
    return d


# ---------------------------------------------------------------- tables
def table(rows: list[list[str]], widths: list[float], head: bool = True, status_col: int | None = None) -> Table:
    data = [[Paragraph(c, CELL) for c in r] for r in rows]
    t = Table(data, colWidths=widths, repeatRows=1 if head else 0)
    style = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.4, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]
    if head:
        style += [("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f3f4f6"))]
    if status_col is not None:
        for i, r in enumerate(rows[1:], start=1):
            s = r[status_col]
            c = DONE if "DONE" in s else NEXT if "NEXT" in s else None
            if c:
                style.append(("BACKGROUND", (status_col, i), (status_col, i), colors.Color(c.red, c.green, c.blue, alpha=0.15)))
    t.setStyle(TableStyle(style))
    return t


def shot(name: str, width: float, crop_h: int | None = None) -> Image:
    from PIL import Image as PIL

    p = SHOTS / name
    img = PIL.open(p)
    if crop_h and img.height > crop_h:
        out = Path(__file__).resolve().parent / f".tmp-{name}"
        img.crop((0, 0, img.width, crop_h)).save(out)
        p = out
        img = PIL.open(p)
    h = width * img.height / img.width
    im = Image(str(p), width=width, height=h)
    im.hAlign = "CENTER"
    return im


def footer(canvas, doc) -> None:  # noqa: ANN001
    canvas.saveState()
    canvas.setStrokeColor(LINE)
    canvas.line(18 * mm, 13 * mm, A4[0] - 18 * mm, 13 * mm)
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawString(18 * mm, 9 * mm, "AttendIQ - Smart Attendance (AIoT) - project overview, 18 Nov 2026")
    canvas.drawRightString(A4[0] - 18 * mm, 9 * mm, f"page {doc.page}")
    canvas.restoreState()


# ---------------------------------------------------------------- document
def build() -> None:
    s: list = []
    s += [
        Paragraph("AttendIQ: Smart Attendance System (AIoT)", ParagraphStyle("t", parent=H1, fontSize=21, textColor=BRAND)),
        Paragraph("System architecture, progress and remaining work  |  IoT course project  |  18 November 2026", SMALL),
        Spacer(1, 8),
        Paragraph(
            "A camera at the classroom door marks students <b>present</b> or <b>late</b> by face recognition on a laptop in the room "
            "(the edge node). A second camera inside counts how many people are really there. If the count is higher than the "
            "number of recognised students, the unmarked students get a push notification and prove they are in the room with "
            "their own phone (face + liveness + rotating room QR + GPS). Ten minutes before the end the room is counted again to "
            "catch early leavers. Admin, professor and student portals, appeals, reports and a full audit log sit on top.",
            BODY,
        ),
        Spacer(1, 4),
        Paragraph("Live deployment: <b>https://attendiq-rho.vercel.app</b> (web app, installable as a phone app).", BODY),
        Paragraph("System architecture (mapped to the Cisco IoT 7-layer model)", H2),
        architecture(),
        Paragraph("Dots show build status. Video never leaves the classroom: the edge laptop sends only small events.", CAP),
    ]
    s += [PageBreak(), Paragraph("Cisco IoT reference model: what sits on each layer", H2)]
    s.append(table([
        ["Layer", "In this system"],
        ["L1 Physical devices", "Gate camera (Android phone, IP Webcam), inside camera (webcam / phone #2), student smartphones "
         "(front camera, GPS), ESP32 door LED"],
        ["L2 Connectivity", "Campus Wi-Fi. MJPEG over HTTP (camera to laptop), MQTT via Mosquitto (edge events), HTTPS + "
         "WebSocket (cloud, phones), Cloudflare Tunnel (face API)"],
        ["L3 Edge (fog) computing", "Python on the classroom laptop: InsightFace face detection + recognition, YOLOv8n person "
         "counting, entry-line logic, de-duplication, offline queue"],
        ["L4 Data accumulation", "Supabase Postgres + pgvector (face vectors), Supabase Storage, SQLite queue on the laptop"],
        ["L5 Data abstraction", "SQL views and functions (roster, live counts, mismatch), Row-Level Security per role"],
        ["L6 Application", "Next.js portals, live dashboard via Realtime, attendance rule engine (pg_cron), reports + CSV"],
        ["L7 Collaboration / process", "Late/absent policy, professor approvals, student appeals, admin audit, biometric "
         "consent, low-attendance warnings"],
    ], [38 * mm, W - 38 * mm]))
    s += [Paragraph("One class, start to finish", H2), class_timeline()]
    s += [Paragraph("Face enrollment (built and tested on a real phone)", H2), enrollment_flow()]
    s += [Paragraph("Technology", H2), table([
        ["Part", "Technology"],
        ["Web app (all portals + API)", "Next.js 16 (TypeScript), Tailwind, shadcn/ui, PWA; hosted on Vercel"],
        ["Database, auth, realtime", "Supabase: Postgres 17, pgvector, PostGIS, pg_cron, pg_net; RLS on every table"],
        ["Face recognition", "InsightFace buffalo_l (SCRFD detector + ArcFace) on CPU with ONNX Runtime, FastAPI service"],
        ["Liveness in the browser", "MediaPipe Face Landmarker (blink / smile from blendshapes, head turn from landmarks)"],
        ["Edge AI", "Python 3.11, OpenCV, InsightFace (gate), Ultralytics YOLOv8n (count)"],
        ["IoT messaging / push", "MQTT (Mosquitto)  |  Web Push with VAPID keys"],
    ], [42 * mm, W - 42 * mm])]

    s += [PageBreak(), Paragraph("Progress", H1), progress_bar(), Spacer(1, 6)]
    s.append(table([
        ["#", "What", "Status", "Proof (done) / gate to pass (planned)"],
        ["0", "Tools, repo, env files", "DONE", "All tools installed; repo skeleton committed"],
        ["1", "Database: 31 tables, security rules, attendance rule engine, seed data",
         "DONE", "91 SQL tests pass (every edge case: late, re-entry, duplicate event, camera offline, ...); "
         "a student cannot read another student's data; pg_cron runs every minute"],
        ["2", "Web app: login, roles, admin + operator portals", "DONE",
         "Lint/type/build clean; 39 unit tests; 5 browser tests (admin creates course -> section -> enrolls student)"],
        ["3", "Installable app, push notifications, inbox, deployed", "DONE",
         "Enrolling a student sent a real push to the Android phone; tapping it opened the app"],
        ["4", "Face API, consent, liveness, guided capture, duplicate check", "DONE",
         "Enrolled on the phone: active with 9 face vectors; same face on a 2nd account flagged for review (0.90). "
         "85 unit + 18 Python tests"],
        ["5", "Gate camera pipeline, MQTT, ingest, 30-student simulator", "NEXT",
         "Gate: simulated class gets correct statuses; walking past phone #1 marks me present"],
        ["6", "Inside count, professor live dashboard, mismatch, self-verify", "planned",
         "Hide face at gate -> push -> verify with QR + face -> present; printed photo fails"],
        ["7", "Early-leave recheck, finalize, appeals, reports", "planned", "Scripted demo class ends with exactly the expected statuses"],
        ["8", "ESP32 door LED, security hardening, docs, demo script", "planned", "Definition of done + rehearsed demo"],
    ], [11 * mm, 52 * mm, 16 * mm, W - 79 * mm], status_col=2))
    s += [Paragraph("Screens already built", H2)]
    sw = (W - 6 * mm) / 2
    pics = Table([[shot("admin.png", sw), shot("admin-faces.png", sw, crop_h=900)],
                  [Paragraph("Admin dashboard", CAP), Paragraph("Face enrollment board (review queue, re-enroll)", CAP)],
                  [shot("admin-rooms-B204.png", sw), shot("operator.png", sw)],
                  [Paragraph("Room B204 with GPS geofence drawn on a map", CAP), Paragraph("Operator: edge devices and cameras", CAP)]],
                 colWidths=[sw + 3 * mm, sw + 3 * mm])
    pics.setStyle(TableStyle([("ALIGN", (0, 0), (-1, -1), "CENTER"), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                              ("LEFTPADDING", (0, 0), (-1, -1), 1), ("RIGHTPADDING", (0, 0), (-1, -1), 1)]))
    s.append(pics)

    s += [PageBreak(), Paragraph("What is left", H1)]
    left = [
        ("Phase 5 - Gate camera (next)", [
            "Edge service on the laptop reads phone #1's video, detects and tracks faces, checks the door-line crossing "
            "direction and votes over several frames before naming a student.",
            "Events go laptop -> MQTT -> ingest worker -> web API (per-device key) -> database -> present/late.",
            "Simulator: 30 virtual students with scripted arrivals, so a full class can be tested with 1-3 real people.",
            "Live test: walk past the door camera and get marked present; report the delay (camera -> database).",
        ]),
        ("Phase 6 - Counting, live dashboard, self-verify", [
            "YOLOv8n counts people in the seat area every few seconds (median of 10 to ignore flicker).",
            "Professor live page: roster with status badges, counters (verified / counted / enrolled), mismatch banner.",
            "Self-verify page on the phone: GPS inside the room geofence, rotating room QR (changes every 20 s), "
            "face + liveness check.",
        ]),
        ("Phase 7 - End of class and paperwork", [
            "Recount 10 minutes before the end; students who do not re-verify become 'left early'.",
            "Finalize with fail-safes, student appeals with evidence, reports and CSV export.",
        ]),
        ("Phase 8 - Finish", [
            "ESP32 LED at the door (green = recognised, red = unknown) over MQTT.",
            "Security pass (rate limits, per-role access tests), data retention jobs, demo reset script, final docs.",
        ]),
    ]
    for title, items in left:
        block = [Paragraph(title, H2)] + [Paragraph("&bull; " + it, BODY) for it in items]
        s.append(KeepTogether(block))
    s += [Paragraph("Known limits and open points", H2)]
    for it in [
        "Liveness runs in the phone browser. It stops printed photos and frozen screens; a modified app could skip it. "
        "A server-side liveness check is an optional hardening step.",
        "The face API runs on the classroom laptop behind a free Cloudflare quick tunnel; its address changes when it restarts "
        "(a fixed address needs a Cloudflare account and a domain).",
        "The InsightFace models are licensed for non-commercial research only: fine for a course prototype, not for a product.",
        "Tested on Android Chrome so far; iPhone (Safari) still has to be tried.",
        "Face threshold report on real photos of several people is still to be produced (scripts/face-eval.py is ready).",
    ]:
        s.append(Paragraph("&bull; " + it, BODY))
    s += [Paragraph("Privacy by design", H2), Paragraph(
        "Separate, versioned biometric consent (Korean PIPA); withdrawing it deletes the face data. Only 512-number face vectors "
        "are stored, not photos. Classroom video never leaves the room. Every change to attendance by staff is written to an "
        "audit log by the database itself. Each table has row-level security, so a student can only ever read their own records.",
        BODY)]

    doc = SimpleDocTemplate(str(OUT), pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm,
                            bottomMargin=18 * mm, title="AttendIQ - Smart Attendance: architecture and progress",
                            author="AttendIQ project")
    doc.build(s, onFirstPage=footer, onLaterPages=footer)
    for tmp in Path(__file__).resolve().parent.glob(".tmp-*"):
        tmp.unlink()
    print(f"written {OUT}")


if __name__ == "__main__":
    build()
