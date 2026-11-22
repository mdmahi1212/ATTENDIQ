"""Builds docs/AttendIQ-Milestone-Report.pdf: milestone status for the professor (22 Nov 2026).

Reuses the styles and drawing helpers of make-overview-pdf.py.
Run: python scripts/make-milestone-pdf.py   (needs reportlab + Pillow)
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

from reportlab.graphics.shapes import Drawing, Rect, String
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.platypus import KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

HERE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location("overview", HERE / "make-overview-pdf.py")
ov = importlib.util.module_from_spec(_spec)  # type: ignore[arg-type]
_spec.loader.exec_module(ov)  # type: ignore[union-attr]

OUT = ov.ROOT / "docs" / "AttendIQ-Milestone-Report.pdf"
W, INK, MUTED, LINE, BRAND = ov.W, ov.INK, ov.MUTED, ov.LINE, ov.BRAND
DONE, NEXT, TODO = ov.DONE, ov.NEXT, ov.TODO
H1, H2, BODY, SMALL = ov.H1, ov.H2, ov.BODY, ov.SMALL
DATE = "22 Nov 2026"


def legend(d: Drawing, x: float, y: float) -> None:
    for i, (c, t) in enumerate([(DONE, "built + tested live"), (NEXT, "built, live test open"), (TODO, "not built (no hardware)")]):
        d.add(Rect(x + i * 110, y, 7, 7, rx=3.5, ry=3.5, fillColor=c, strokeColor=c))
        d.add(String(x + i * 110 + 11, y + 1, t, fontName="Helvetica", fontSize=7, fillColor=MUTED))


def architecture() -> Drawing:
    H = 392
    d = Drawing(W, H)
    rows = {"app": (300, 80), "cloud": (200, 88), "edge": (92, 96), "dev": (0, 80)}
    ov.band(d, *rows["app"], "APPS", "L6-L7", "app")
    ov.band(d, *rows["cloud"], "CLOUD", "L4-L6", "cloud")
    ov.band(d, *rows["edge"], "EDGE", "L3 (fog)", "edge")
    ov.band(d, *rows["dev"], "DEVICES", "L1-L2", "dev")
    x0, gap = 66, 8
    bw = (W - x0 - 3 * gap - 4) / 4

    def col(i: int) -> float:
        return x0 + i * (bw + gap)

    box = ov.box
    ay, ah = rows["app"][0] + 8, 60
    box(d, col(0), ay, bw, ah, "Admin portal", ["dashboard, timetable", "people, faces, reports", "audit log, devices"], "app", "done")
    box(d, col(1), ay, bw, ah, "Professor portal", ["live room dashboard", "count alert, recheck", "appeals, at-risk list"], "app", "done")
    box(d, col(2), ay, bw, ah, "Student PWA", ["face enroll + liveness", "self-verify, streak", "appeals, inbox"], "app", "done")
    box(d, col(3), ay, bw, ah, "Web Push (VAPID)", ["DB webhook -> Node route", "-> phone notification", "Realtime inbox fallback"], "app", "done")
    d.add(String(W - 4, rows["app"][0] + rows["app"][1] - 9, "Next.js on Vercel", fontName="Helvetica-Oblique",
                 fontSize=6.6, fillColor=MUTED, textAnchor="end"))
    cy, ch = rows["cloud"][0] + 8, 66
    box(d, col(0), cy, bw, ch, "Postgres + RLS", ["RLS on every table", "audit log by trigger", "Auth (4 roles, MFA ready)"], "cloud", "done")
    box(d, col(1), cy, bw, ch, "pgvector faces", ["512-d embeddings", "HNSW cosine index", "duplicate check"], "cloud", "done")
    box(d, col(2), cy, bw, ch, "Rule engine", ["pg_cron every minute", "late, count alert,", "finalize, left_no_return"], "cloud", "done")
    box(d, col(3), cy, bw, ch, "Realtime + Storage", ["live table changes", "private buckets", "retention jobs"], "cloud", "done")
    d.add(String(W - 4, rows["cloud"][0] + rows["cloud"][1] - 9, "Supabase", fontName="Helvetica-Oblique", fontSize=6.6,
                 fillColor=MUTED, textAnchor="end"))
    ey, eh = rows["edge"][0] + 8, 66
    box(d, col(0), ey, bw, eh, "Gate + exit pipeline", ["InsightFace on GPU", "track, line-cross, vote", "-> IN / OUT events"], "edge", "done")
    box(d, col(1), ey, bw, eh, "Occupancy pipeline", ["YOLO11x on GPU", "seat ROI, median filter", "-> room count"], "edge", "next")
    box(d, col(2), ey, bw, eh, "MQTT + ingest", ["Mosquitto broker", "offline outbox (SQLite)", "-> HTTPS (device key)"], "edge", "done")
    box(d, col(3), ey, bw, eh, "Face API", ["FastAPI + InsightFace", "+ anti-spoof model", "Cloudflare Tunnel"], "edge", "done")
    d.add(String(W - 4, rows["edge"][0] + rows["edge"][1] - 9, "classroom laptop (RTX 3060)", fontName="Helvetica-Oblique",
                 fontSize=6.6, fillColor=MUTED, textAnchor="end"))
    dy, dh = rows["dev"][0] + 8, 56
    box(d, col(0), dy, bw, dh, "Gate camera", ["phone #1 (IP Webcam)", "outside the door"], "dev", "done")
    box(d, col(1), dy, bw, dh, "Inside / exit camera", ["phone #2 (iPhone)", "beside the door"], "dev", "done")
    box(d, col(2), dy, bw, dh, "ESP32 door LED", ["green / red via MQTT", "firmware written"], "dev", "todo")
    box(d, col(3), dy, bw, dh, "Student phones", ["Student PWA (HTTPS)", "camera, GPS, QR, push"], "dev", "done")

    cx = [col(i) + bw / 2 for i in range(4)]
    ov.arrow(d, cx[0], dy + dh, cx[0], ey, label="video frames", lx=-26)
    ov.arrow(d, cx[1], dy + dh, cx[1], ey, label="frames", lx=-18)
    ov.arrow(d, cx[2] - 18, ey, cx[2] - 18, dy + dh, label="LED cmd", lx=-20, dash=True)
    ov.arrow(d, cx[2], ey + eh, cx[2], cy, label="events (no video)", lx=-34)
    ov.arrow(d, col(0) + bw, ey + 33, col(1), ey + 33)
    ov.arrow(d, col(1) + bw, ey + 33, col(2), ey + 33)
    ov.arrow(d, cx[1], cy + ch, cx[1], ay, label="Realtime", lx=18)
    ov.arrow(d, cx[0], ay, cx[0], cy + ch, label="queries (RLS)", lx=-26)
    ov.arrow(d, cx[3], cy + ch, cx[3], ay, label="notify -> push", lx=-26)
    legend(d, 66, H - 9)
    return d


def class_timeline() -> Drawing:
    H = 100
    d = Drawing(W, H)
    y = 70
    d.add(ov.Line(0, y, W, y, strokeColor=INK, strokeWidth=1.4))
    marks = [
        (1 / 12, "T0 - 10 min", "session goes live,", "everyone 'pending'"),
        (3 / 12, "T0 .. T0 + 10", "gate camera marks", "present, then late"),
        (5 / 12, "during class", "count > verified", "-> 'verify now' push"),
        (7 / 12, "any time", "exit camera sees a", "student leave -> OUT"),
        (9 / 12, "T_end - 5 min", "count != present", "-> professor alert"),
        (11 / 12, "T_end", "left, never back", "-> absent"),
    ]
    for f, t, a, b in marks:
        x = f * W
        d.add(Rect(x - 3.5, y - 3.5, 7, 7, rx=3.5, ry=3.5, fillColor=BRAND, strokeColor=BRAND))
        d.add(String(x, y + 12, t, fontName="Helvetica-Bold", fontSize=7.4, fillColor=BRAND, textAnchor="middle"))
        d.add(String(x, y - 16, a, fontName="Helvetica", fontSize=6.9, fillColor=INK, textAnchor="middle"))
        d.add(String(x, y - 26, b, fontName="Helvetica", fontSize=6.9, fillColor=INK, textAnchor="middle"))
    d.add(String(0, 18, "At the alert the professor may press Start recheck: students who do not re-verify become 'left early'.",
                 fontName="Helvetica", fontSize=7.6, fillColor=INK))
    d.add(String(0, 6, "No mass notifications to students. If a camera was offline, finalize gives 'needs review', never 'absent'.",
                 fontName="Helvetica", fontSize=7.6, fillColor=MUTED))
    return d


def progress_bar() -> Drawing:
    d = Drawing(W, 40)
    phases = [str(i) for i in range(9)]
    state = ["done"] * 8 + ["next"]
    seg = W / len(phases)
    for i, (p, s) in enumerate(zip(phases, state, strict=True)):
        c = DONE if s == "done" else NEXT
        d.add(Rect(i * seg + 1, 14, seg - 2, 16, fillColor=c, strokeColor=None))
        d.add(String(i * seg + seg / 2, 19, f"Phase {p}", fontName="Helvetica-Bold", fontSize=7.4,
                     fillColor=colors.white, textAnchor="middle"))
    d.add(String(0, 2, "All 9 phases built. Phases 0-7 closed by a passed gate; Phase 8 (final demo) mostly passed live.",
                 fontName="Helvetica", fontSize=7.6, fillColor=MUTED))
    return d


def kpis() -> Table:
    items = [("9 / 9", "phases built"), ("370+", "automated tests passing"), ("11 / 11", "browser end-to-end tests"),
             ("44 ms", "face recognition per frame (GPU)"), ("1 s", "door to 'present' in the DB"), ("0", "events lost in Wi-Fi cut")]
    big = ov.ParagraphStyle("k", parent=BODY, fontName="Helvetica-Bold", fontSize=15, leading=18, textColor=BRAND)
    cells = [[Paragraph(v, big), Paragraph(t, SMALL)] for v, t in items]
    data = [[Table([[c[0]], [c[1]]]) for c in cells[:3]], [Table([[c[0]], [c[1]]]) for c in cells[3:]]]
    t = Table(data, colWidths=[W / 3] * 3)
    t.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.4, LINE), ("INNERGRID", (0, 0), (-1, -1), 0.4, LINE),
                           ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
                           ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
    return t


def footer(canvas, doc) -> None:  # noqa: ANN001
    canvas.saveState()
    canvas.setStrokeColor(LINE)
    canvas.line(18 * mm, 13 * mm, A4[0] - 18 * mm, 13 * mm)
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawString(18 * mm, 9 * mm, f"AttendIQ - Smart Attendance (AIoT) - milestone report, {DATE}")
    canvas.drawRightString(A4[0] - 18 * mm, 9 * mm, f"page {doc.page}")
    canvas.restoreState()


def build() -> None:
    t = ov.table
    s: list = []
    s += [Paragraph("AttendIQ - Smart Attendance (AIoT)", H1),
          Paragraph(f"<b>Project milestone report</b> - {DATE}", BODY),
          Paragraph("Live web app: https://attendiq-rho.vercel.app &nbsp;|&nbsp; Code: github.com/mdmahi1212/ATTENDIQ", SMALL),
          Spacer(1, 8),
          Paragraph("AttendIQ marks university attendance automatically. A phone camera at the door recognises each student's "
                    "face and marks them present or late. A second camera inside the room counts people and sees who walks out. "
                    "When the numbers do not add up, students prove they are in the room from their own phone (face + liveness "
                    "+ rotating room QR + GPS) and the professor is alerted. The design follows the Cisco 7-layer IoT model.",
                    BODY),
          Spacer(1, 8), progress_bar(), Spacer(1, 6), kpis()]

    s += [Paragraph("1. Milestones", H2),
          t([["Phase", "Milestone", "Date", "Status / gate evidence"],
             ["0", "Preflight: repo, toolchain, env examples", "18 Nov", "DONE"],
             ["1", "Database: schema, RLS, rule engine, seed, SQL tests", "18 Nov", "DONE - SQL test suites pass"],
             ["2", "Web foundation: sign-in, roles, admin + operator portals", "18 Nov", "DONE - e2e tests pass"],
             ["3", "PWA, Web Push, notification inbox, Vercel deploy", "18 Nov", "DONE - push received on a real phone"],
             ["4", "Face API, consent, liveness, face enrollment", "18 Nov", "DONE - enrollment + duplicate check"],
             ["5", "Edge gate pipeline, MQTT, ingest, simulator", "18 Nov", "DONE - live: door to 'present' in 0.99 s"],
             ["6", "Occupancy count, live dashboard, self-verify", "18 Nov", "DONE - printed photo rejected (0/59)"],
             ["7", "Recheck, finalize, appeals, student portal, reports", "19 Nov", "DONE - 30-student class, 0 differences"],
             ["8", "Hardening, privacy, ESP32, docs, live demo", "19-22 Nov", "DONE (mostly) - see section 4"],
             ["+", "Exit camera, professor alert rule, GPU models, new UI", "22 Nov", "DONE - live 2-camera test passed"]],
            [12 * mm, 78 * mm, 20 * mm, W - 110 * mm], status_col=3)]

    s += [PageBreak(), Paragraph("2. System architecture (current)", H2), architecture(),
          Paragraph("Cameras stream to the classroom laptop; only events (never video) go to the cloud. "
                    "The service-role key exists only on the server; every device signs in with its own hashed API key.", SMALL),
          Paragraph("3. How one class runs (attendance rules)", H2), class_timeline()]

    s += [PageBreak(), Paragraph("4. Live tests with real phones and people", H2),
          t([["Test", "What happened", "Result"],
             ["Walk-in at the door", "Gate phone recognised the student 1 s after the class opened (score 0.74-0.81)", "DONE present"],
             ["Late arrival", "Recognised 12 min after start", "DONE late"],
             ["Self-verify on phone", "Push in 6 s, room QR + face 0.89 + liveness 0.997 -> verified in 64 s", "DONE present"],
             ["Photo attack", "Printed photo at the phone: browser challenge + server anti-spoof model, 0/59 frames accepted",
              "DONE rejected"],
             ["Recheck ignored", "Student ignored the recheck window", "DONE left early"],
             ["Two-camera exit", "Two students entered; one left past the exit camera and never came back",
              "DONE absent (left_no_return)"],
             ["Appeal", "Student appealed, professor approved with a note, audit row + push", "DONE excused"],
             ["Wi-Fi cut 1 min", "Laptop Wi-Fi off mid-class; 15 events queued and delivered after reconnect, 0 lost",
              "DONE no loss"],
             ["Camera offline at end", "Inside camera unhealthy at finalize -> students 'needs review', not absent",
              "DONE fail-safe"]],
            [34 * mm, W - 74 * mm, 40 * mm], status_col=2)]

    s += [Paragraph("5. Automated tests (all passing)", H2),
          t([["Area", "Tests"],
             ["Database (pgTAP, each rolled back)", "rule engine 107, manual marks 9, appeals 19, RLS matrix 13 (62 probes), "
              "privacy 9"],
             ["Web app", "125 unit tests (Vitest), 11/11 browser end-to-end tests (Playwright), lint + typecheck + build"],
             ["Python services", "face-api 20, edge 38, ingest 7, simulator 11 + live class replay, shared lib 5 (ruff clean)"]],
            [52 * mm, W - 52 * mm])]

    s += [Paragraph("6. Performance on the classroom laptop", H2),
          t([["Model", "CPU", "GPU (RTX 3060)", "Note"],
             ["InsightFace buffalo_l (faces)", "238 ms", "44 ms", "same embeddings on CPU and GPU (cosine 1.0)"],
             ["YOLO11x (person count)", "361 ms", "27 ms", "counted 6/6, 2/2, 0/0 on real pictures"]],
            [48 * mm, 22 * mm, 30 * mm, W - 100 * mm])]

    s += [Paragraph("7. New since the last report (18 Nov)", H2),
          t([["Feature", "What it does"],
             ["Exit camera", "The inside phone beside the door sees a recognised student leaving -> OUT event."],
             ["Absent if not back", "At the end, a student whose last door event is OUT (no re-entry or re-verify) is marked "
              "absent."],
             ["Professor-only alert", "5 min before the end, if the room count differs from the present count, only the "
              "professor is notified, who can start a recheck. No mass student notifications."],
             ["Live room dashboard", "Per class: room count vs door entries chart, door timeline, time in class per student, "
              "device health; updates live."],
             ["GPU models", "Both face recognition and YOLO11x person counting run on the NVIDIA GPU (5-13x faster)."],
             ["New UI + mobile app", "AttendIQ logo, redesigned admin / professor / student dashboards (KPIs, 14-day chart, "
              "at-risk students, streaks), phone layout with a bottom tab bar, installable as an app."]],
            [38 * mm, W - 38 * mm])]

    sw = (W - 6 * mm) / 2
    s += [KeepTogether([Paragraph("8. Screenshots", H2), Table([[ov.shot("admin.png", sw), ov.shot("operator.png", sw)]], colWidths=[sw + 3 * mm] * 2),
                        Paragraph("Admin dashboard (left) and device / operator view (right)", ov.CAP)])]

    s += [Paragraph("9. Remaining work", H2),
          t([["Item", "Why open", "Plan"],
             ["Live labelled camera view", "Written, not run yet", "Show face + person boxes with names to the class"],
             ["ESP32 door LED", "No board available", "Firmware ready; flash when a board is available"],
             ["Clean-laptop install test", "Needs a second laptop", "Follow README quick start from a fresh clone"],
             ["GPU load during a full class", "Not measured live", "Measure in the final demo"],
             ["Face accuracy on a larger group", "Only 2 students enrolled", "Enroll more classmates, measure FAR / FRR"]],
            [48 * mm, 44 * mm, W - 92 * mm])]

    doc = SimpleDocTemplate(str(OUT), pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm,
                            bottomMargin=18 * mm, title="AttendIQ milestone report", author="AttendIQ team")
    doc.build(s, onFirstPage=footer, onLaterPages=footer)
    print(OUT)


if __name__ == "__main__":
    build()
