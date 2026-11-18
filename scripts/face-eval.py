"""Face recognition threshold evaluation (genuine vs impostor cosine similarity).

Usage (from the repo root, with the face-api venv):
    apps\\face-api\\.venv\\Scripts\\python.exe scripts\\face-eval.py eval
    apps\\face-api\\.venv\\Scripts\\python.exe scripts\\face-eval.py eval --out docs\\face-eval.md

Input: eval/<person>/*.jpg  (>= 2 people, >= 2 photos each; eval/ is gitignored: these are faces).
Every photo goes through the SAME quality gates as the face-api (one face, size, blur, det score);
rejected photos are listed and left out. Then every pair is scored:
  genuine  = two photos of the same person
  impostor = photos of two different people
and a FAR/FRR table is printed for candidate thresholds.
"""

from __future__ import annotations

import argparse
import itertools
import statistics
import sys
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

import numpy as np

API_DIR = Path(__file__).resolve().parent.parent / "apps" / "face-api"
sys.path.insert(0, str(API_DIR))

from app.config import Settings  # noqa: E402
from app.engine import InsightFaceEngine  # noqa: E402
from app.quality import Limits, decode_image, evaluate  # noqa: E402

THRESHOLDS = [0.25, 0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70]
EXTS = {".jpg", ".jpeg", ".png"}


@dataclass
class Sample:
    person: str
    path: Path
    emb: np.ndarray


def load(root: Path, engine: InsightFaceEngine, limits: Limits) -> tuple[list[Sample], list[str]]:
    samples: list[Sample] = []
    rejected: list[str] = []
    for person_dir in sorted(p for p in root.iterdir() if p.is_dir()):
        for f in sorted(p for p in person_dir.iterdir() if p.suffix.lower() in EXTS):
            img = decode_image(f.read_bytes())
            if img is None:
                rejected.append(f"{person_dir.name}/{f.name}: not an image")
                continue
            r = evaluate(img, engine.detect(img), limits)
            if not r.ok or r.embedding is None:
                rejected.append(f"{person_dir.name}/{f.name}: {r.reason}")
                continue
            samples.append(Sample(person_dir.name, f, np.asarray(r.embedding, dtype=np.float32)))
    return samples, rejected


def pairs(samples: list[Sample]) -> tuple[list[float], list[float]]:
    genuine: list[float] = []
    impostor: list[float] = []
    for a, b in itertools.combinations(samples, 2):
        s = float(np.dot(a.emb, b.emb))
        (genuine if a.person == b.person else impostor).append(s)
    return genuine, impostor


def describe(xs: list[float]) -> str:
    if not xs:
        return "n=0"
    q = np.percentile(xs, [1, 5, 50, 95, 99])
    return (
        f"n={len(xs)} min={min(xs):.3f} p1={q[0]:.3f} p5={q[1]:.3f} median={q[2]:.3f} "
        f"p95={q[3]:.3f} p99={q[4]:.3f} max={max(xs):.3f} mean={statistics.fmean(xs):.3f}"
    )


def histogram(xs: list[float], lo: float = -0.2, hi: float = 1.0, bins: int = 12, width: int = 40) -> list[str]:
    counts, edges = np.histogram(xs, bins=bins, range=(lo, hi))
    top = max(counts.max(), 1)
    return [f"{edges[i]:+.1f}..{edges[i + 1]:+.1f} | {'#' * round(c / top * width)} {c}" for i, c in enumerate(counts)]


def report(root: Path, samples: list[Sample], rejected: list[str], genuine: list[float], impostor: list[float]) -> str:
    people = sorted({s.person for s in samples})
    lines = [
        "# Face recognition evaluation",
        "",
        f"Generated {datetime.now(UTC):%Y-%m-%d %H:%M UTC} by `scripts/face-eval.py` on `{root.name}/`.",
        "Model: InsightFace buffalo_l (SCRFD det_10g + ArcFace w600k_r50), same quality gates as apps/face-api.",
        "",
        f"- People: {len(people)}; usable photos: {len(samples)}; rejected photos: {len(rejected)}",
        f"- Genuine pairs: {describe(genuine)}",
        f"- Impostor pairs: {describe(impostor)}",
        "",
        "## Threshold table",
        "",
        "Accept when similarity >= threshold. FAR = impostor pairs accepted; FRR = genuine pairs rejected.",
        "",
        "| threshold | FAR | FRR |",
        "|---:|---:|---:|",
    ]
    for t in THRESHOLDS:
        far = sum(s >= t for s in impostor) / len(impostor) if impostor else float("nan")
        frr = sum(s < t for s in genuine) / len(genuine) if genuine else float("nan")
        lines.append(f"| {t:.2f} | {far:.2%} | {frr:.2%} |")

    lines += ["", "## Suggested thresholds", ""]
    if genuine and impostor:
        imp_max = max(impostor)
        safe = [t for t in THRESHOLDS if all(s < t for s in impostor)]
        lines.append(
            f"- Highest impostor score seen: {imp_max:.3f}. Lowest threshold with zero false accepts here: {safe[0]:.2f}"
            if safe
            else f"- Highest impostor score seen: {imp_max:.3f}; no tested threshold has zero false accepts."
        )
        best = min(
            THRESHOLDS,
            key=lambda t: abs(sum(s >= t for s in impostor) / len(impostor) - sum(s < t for s in genuine) / len(genuine)),
        )
        lines.append(f"- Approximate equal-error threshold: {best:.2f}")
        lines.append(
            "- Project defaults: gate match >= 0.45 (with track voting), duplicate-enrollment flag > 0.60, "
            "self-verify >= 0.45. Small datasets make these numbers rough: re-run with more people."
        )
    else:
        lines.append("- Need at least 2 people with 2+ usable photos each.")

    lines += [
        "",
        "## Distributions",
        "",
        "Genuine:",
        "```",
        *histogram(genuine),
        "```",
        "Impostor:",
        "```",
        *histogram(impostor),
        "```",
    ]
    if rejected:
        lines += ["", "## Rejected photos", "", *[f"- {r}" for r in rejected]]
    return "\n".join(lines) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("folder", type=Path, help="eval/<person>/*.jpg")
    ap.add_argument("--out", type=Path, help="also write the Markdown report here (e.g. docs/face-eval.md)")
    args = ap.parse_args()
    if not args.folder.is_dir():
        print(f"not a folder: {args.folder}", file=sys.stderr)
        return 2

    s = Settings(_env_file=None)  # thresholds only; no secret needed
    home = Path(s.insightface_home)
    if not home.is_absolute():
        home = API_DIR / home
    engine = InsightFaceEngine(s.insightface_model, str(home), s.det_size)
    limits = Limits(min_face_px=s.min_face_px, min_det_score=s.min_det_score, min_blur=s.min_blur_laplacian_var)

    samples, rejected = load(args.folder, engine, limits)
    genuine, impostor = pairs(samples)
    md = report(args.folder, samples, rejected, genuine, impostor)
    print(md)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(md, encoding="utf-8")
        print(f"written: {args.out}")
    return 0 if genuine and impostor else 1


if __name__ == "__main__":
    raise SystemExit(main())
