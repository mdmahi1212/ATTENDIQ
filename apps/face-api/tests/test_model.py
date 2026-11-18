"""Integration tests with the real buffalo_l model on InsightFace's bundled sample photo (t1.jpg,
six faces). Skipped when the model pack has not been downloaded yet."""

from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np
import pytest

from app.quality import Limits, evaluate

ROOT = Path(__file__).resolve().parent.parent
MODEL_DIR = ROOT / "models" / "models" / "buffalo_l"
pytestmark = pytest.mark.skipif(not (MODEL_DIR / "det_10g.onnx").exists(), reason="buffalo_l not downloaded")

LIM = Limits(min_face_px=80, min_det_score=0.6, min_blur=60.0)


@pytest.fixture(scope="module")
def engine():
    from app.engine import InsightFaceEngine

    return InsightFaceEngine("buffalo_l", str(ROOT / "models"), 640, liveness=True)


@pytest.fixture(scope="module")
def group() -> np.ndarray:
    from insightface.data import get_image

    return get_image("t1")


@pytest.fixture(scope="module")
def boxes(engine, group) -> list[np.ndarray]:
    faces = sorted(engine.detect(group), key=lambda f: float(f.bbox[0]))
    assert len(faces) == 6
    return [f.bbox.astype(int) for f in faces]


def crop(img: np.ndarray, box: np.ndarray, pad: float = 0.6) -> np.ndarray:
    x1, y1, x2, y2 = box
    w, h = x2 - x1, y2 - y1
    X1, Y1 = max(0, int(x1 - pad * w)), max(0, int(y1 - pad * h))
    X2, Y2 = min(img.shape[1], int(x2 + pad * w)), min(img.shape[0], int(y2 + pad * h))
    out = img[Y1:Y2, X1:X2]
    # Upscale so the face is comfortably above the 80 px minimum, like a phone selfie.
    return cv2.resize(out, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)


def test_single_face_accepted_with_unit_embedding(engine, group, boxes) -> None:
    img = crop(group, boxes[0])
    r = evaluate(img, engine.detect(img), LIM)
    assert r.ok, r
    emb = np.array(r.embedding)
    assert emb.shape == (512,) and abs(np.linalg.norm(emb) - 1) < 1e-3


def test_no_face_rejected(engine) -> None:
    blank = np.full((480, 640, 3), 127, np.uint8)
    assert evaluate(blank, engine.detect(blank), LIM).reason == "no_face"


def test_two_faces_rejected(engine, group, boxes) -> None:
    # The two right-most faces of the group photo in one frame.
    a, b = boxes[-2], boxes[-1]
    x1, y1 = min(a[0], b[0]) - 20, min(a[1], b[1]) - 20
    x2, y2 = max(a[2], b[2]) + 20, max(a[3], b[3]) + 20
    img = group[max(0, y1) : y2, max(0, x1) : x2]
    assert evaluate(img, engine.detect(img), LIM).reason == "multiple_faces"


def test_blurred_face_rejected(engine, group, boxes) -> None:
    img = cv2.GaussianBlur(crop(group, boxes[0]), (0, 0), 5)
    faces = engine.detect(img)
    r = evaluate(img, faces, LIM)
    assert not r.ok and r.reason in {"too_blurry", "no_face", "low_detection_score"}


def test_same_person_scores_higher_than_different_people(engine, group, boxes) -> None:
    base = crop(group, boxes[0])
    variant = cv2.convertScaleAbs(cv2.flip(base, 1), alpha=1.1, beta=10)  # mirrored + brighter
    e1 = np.array(evaluate(base, engine.detect(base), LIM).embedding)
    e2 = np.array(evaluate(variant, engine.detect(variant), LIM).embedding)
    others = []
    for box in boxes[1:]:
        img = crop(group, box)
        r = evaluate(img, engine.detect(img), LIM)
        if r.ok:
            others.append(float(np.dot(e1, np.array(r.embedding))))
    same = float(np.dot(e1, e2))
    assert same > 0.6, same
    assert others and max(others) < 0.35, others
    assert same - max(others) > 0.3


def test_liveness_addon_scores_real_faces_as_live(engine, group, boxes) -> None:  # noqa: ANN001
    from app.quality import Limits, evaluate

    img = crop(group, boxes[0])
    res = evaluate(img, engine.detect(img), Limits(80, 0.6, 30.0)).to_dict()
    assert res["live_score"] is not None and res["live"] is True, res
