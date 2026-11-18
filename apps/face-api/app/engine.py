"""Model loading. InsightFace buffalo_l on CPU (onnxruntime), detection + recognition only."""

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
    def __init__(self, model_name: str, root: str, det_size: int) -> None:
        # Imported here so tests that use a fake engine never load onnx/insightface.
        from insightface.app import FaceAnalysis

        self.model_name = model_name
        self._fa = FaceAnalysis(
            name=model_name,
            root=root,
            allowed_modules=["detection", "recognition"],
            providers=["CPUExecutionProvider"],
        )
        self._fa.prepare(ctx_id=0, det_size=(det_size, det_size))
        log.info("model loaded", extra={"model": model_name, "det_size": det_size})

    def detect(self, img: np.ndarray) -> Sequence[DetectedFace]:
        return self._fa.get(img)
