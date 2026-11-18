"""Model loading. InsightFace buffalo_l on CPU (onnxruntime): detection + recognition, plus the official
passive anti-spoofing addon (liveness.onnx, SHA-256 verified on download) when enabled."""

from __future__ import annotations

import logging
from collections.abc import Sequence
from typing import Protocol

import numpy as np

from app.quality import DetectedFace

log = logging.getLogger("face_api.engine")


class FaceEngine(Protocol):
    model_name: str

    def detect(self, img: np.ndarray) -> Sequence[DetectedFace]: ...


class InsightFaceEngine:
    def __init__(self, model_name: str, root: str, det_size: int, liveness: bool = False,
                 liveness_threshold: float = 0.8) -> None:
        # Imported here so tests that use a fake engine never load onnx/insightface.
        from insightface.app import FaceAnalysis

        self.model_name = model_name
        self.liveness = liveness
        # "observe": every face still gets an embedding; the caller decides what a spoof means
        # (enrollment drops the photo, self-verify fails) instead of silently losing the embedding.
        extra = {"addons": ["liveness"], "liveness_mode": "observe", "liveness_threshold": liveness_threshold} if liveness else {}
        self._fa = FaceAnalysis(
            name=model_name,
            root=root,
            allowed_modules=["detection", "recognition"],
            providers=["CPUExecutionProvider"],
            **extra,
        )
        self._fa.prepare(ctx_id=0, det_size=(det_size, det_size))
        log.info("model loaded", extra={"model": model_name, "det_size": det_size, "liveness": liveness})

    def detect(self, img: np.ndarray) -> Sequence[DetectedFace]:
        return self._fa.get(img)
