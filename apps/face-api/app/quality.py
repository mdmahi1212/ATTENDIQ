"""Per-image checks. Pure functions so they can be tested without the model."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Protocol

import cv2
import numpy as np


class DetectedFace(Protocol):
    """The subset of insightface's Face object that we use."""

    bbox: np.ndarray
    det_score: float

    @property
    def normed_embedding(self) -> np.ndarray: ...


@dataclass(frozen=True)
class Limits:
    min_face_px: int
    min_det_score: float
    min_blur: float


@dataclass(frozen=True)
class EmbedResult:
    ok: bool
    det_score: float | None = None
    face_px: int | None = None
    blur: float | None = None
    embedding: list[float] | None = None
    reason: str | None = None

    def to_dict(self) -> dict[str, object]:
        out: dict[str, object] = {"ok": self.ok, "det_score": self.det_score, "face_px": self.face_px, "blur": self.blur}
        if self.embedding is not None:
            out["embedding"] = self.embedding
        if self.reason is not None:
            out["reason"] = self.reason
        return out


def decode_image(data: bytes) -> np.ndarray | None:
    """JPEG/PNG/WebP bytes -> BGR image, or None when it is not a decodable image."""
    if not data:
        return None
    arr = np.frombuffer(data, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None or img.ndim != 3 or img.shape[0] < 16 or img.shape[1] < 16:
        return None
    return img


def laplacian_variance(img: np.ndarray, bbox: Sequence[float]) -> float:
    """Sharpness of the face crop. The crop is resized to 112 px wide so the score
    does not depend on how large the face is in the frame."""
    h, w = img.shape[:2]
    x1, y1, x2, y2 = (int(round(v)) for v in bbox[:4])
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(w, x2), min(h, y2)
    if x2 - x1 < 4 or y2 - y1 < 4:
        return 0.0
    crop = cv2.cvtColor(img[y1:y2, x1:x2], cv2.COLOR_BGR2GRAY)
    scale = 112.0 / crop.shape[1]
    crop = cv2.resize(crop, (112, max(1, int(round(crop.shape[0] * scale)))), interpolation=cv2.INTER_AREA)
    return float(cv2.Laplacian(crop, cv2.CV_64F).var())


def evaluate(img: np.ndarray, faces: Sequence[DetectedFace], limits: Limits) -> EmbedResult:
    """Apply the spec's rules: exactly one face, wide enough, confident detection, sharp."""
    if len(faces) == 0:
        return EmbedResult(ok=False, reason="no_face")
    if len(faces) > 1:
        return EmbedResult(ok=False, reason="multiple_faces")
    face = faces[0]
    x1, _, x2, _ = (float(v) for v in face.bbox[:4])
    face_px = int(round(x2 - x1))
    det_score = round(float(face.det_score), 4)
    blur = round(laplacian_variance(img, face.bbox), 2)
    base = {"det_score": det_score, "face_px": face_px, "blur": blur}
    if face_px < limits.min_face_px:
        return EmbedResult(ok=False, reason="face_too_small", **base)
    if det_score < limits.min_det_score:
        return EmbedResult(ok=False, reason="low_detection_score", **base)
    if blur < limits.min_blur:
        return EmbedResult(ok=False, reason="too_blurry", **base)
    emb = np.asarray(face.normed_embedding, dtype=np.float32)
    if emb.shape != (512,) or not np.all(np.isfinite(emb)):
        return EmbedResult(ok=False, reason="bad_embedding", **base)
    return EmbedResult(ok=True, embedding=[round(float(v), 6) for v in emb], **base)
