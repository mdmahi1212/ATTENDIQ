"""Quality rules without the model."""

from __future__ import annotations

import cv2
import numpy as np

from app.quality import Limits, decode_image, evaluate, laplacian_variance
from tests.conftest import FakeFace, jpeg, sharp_image

LIM = Limits(min_face_px=80, min_det_score=0.6, min_blur=60.0)


def test_decode_rejects_garbage_and_tiny() -> None:
    assert decode_image(b"") is None
    assert decode_image(b"definitely not a jpeg") is None
    assert decode_image(jpeg(np.zeros((8, 8, 3), np.uint8))) is None
    assert decode_image(jpeg(sharp_image())) is not None


def test_no_face_and_multiple_faces() -> None:
    img = sharp_image()
    assert evaluate(img, [], LIM).reason == "no_face"
    two = [FakeFace(np.array([0, 0, 100, 100]), 0.9), FakeFace(np.array([150, 0, 250, 100]), 0.9)]
    assert evaluate(img, two, LIM).reason == "multiple_faces"


def test_face_too_small() -> None:
    r = evaluate(sharp_image(), [FakeFace(np.array([10, 10, 70, 80]), 0.9)], LIM)
    assert (r.ok, r.reason, r.face_px) == (False, "face_too_small", 60)


def test_low_detection_score() -> None:
    r = evaluate(sharp_image(), [FakeFace(np.array([10, 10, 200, 220]), 0.4)], LIM)
    assert r.reason == "low_detection_score"


def test_blurred_face_rejected_sharp_accepted() -> None:
    img = sharp_image()
    blurred = cv2.GaussianBlur(img, (0, 0), 6)
    box = np.array([20, 20, 220, 240])
    assert laplacian_variance(blurred, box) < 60 < laplacian_variance(img, box)
    assert evaluate(blurred, [FakeFace(box, 0.9)], LIM).reason == "too_blurry"
    assert evaluate(img, [FakeFace(box, 0.9)], LIM).ok is True


def test_bbox_outside_image_is_clamped() -> None:
    assert laplacian_variance(sharp_image(100, 100), [-50, -50, 500, 500]) > 0
    assert laplacian_variance(sharp_image(100, 100), [90, 90, 92, 92]) == 0.0


def test_liveness_verdict_is_reported_not_enforced_here() -> None:
    """The face-api reports live/live_score; Next.js decides (enrollment drops, self-verify fails)."""
    img = sharp_image()
    box = np.array([100, 100, 300, 300], dtype=np.float32)
    limits = Limits(80, 0.6, 1.0)
    spoof = evaluate(img, [FakeFace(box, 0.9, liveness={"status": "ok", "is_live": False, "live_score": 0.04})], limits).to_dict()
    assert spoof["ok"] is True and spoof["live"] is False and spoof["live_score"] == 0.04
    live = evaluate(img, [FakeFace(box, 0.9, liveness={"status": "ok", "is_live": True, "live_score": 0.991})], limits).to_dict()
    assert live["live"] is True and live["live_score"] == 0.991
    no_verdict = {"status": "input_rejected", "is_live": None, "live_score": None}
    rejected = evaluate(img, [FakeFace(box, 0.9, liveness=no_verdict)], limits)
    assert rejected.to_dict()["live"] is None
    off = evaluate(img, [FakeFace(box, 0.9)], limits).to_dict()  # addon disabled
    assert off["live"] is None and off["live_score"] is None
