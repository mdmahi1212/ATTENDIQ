"""InsightFace (SCRFD + ArcFace, buffalo_l, CPU) as a FaceDet detector. Same model as apps/face-api."""

from __future__ import annotations

from pathlib import Path

import numpy as np

from edge.gate import FaceDet


class InsightFaceDetector:
    def __init__(self, root: Path, det_size: int = 640, model: str = "buffalo_l") -> None:
        from insightface.app import FaceAnalysis

        self._app = FaceAnalysis(name=model, root=str(root), allowed_modules=["detection", "recognition"],
                                 providers=["CPUExecutionProvider"])
        self._app.prepare(ctx_id=0, det_size=(det_size, det_size))

    def __call__(self, frame: np.ndarray) -> list[FaceDet]:
        out: list[FaceDet] = []
        for f in self._app.get(frame):
            emb = getattr(f, "normed_embedding", None)
            x1, y1, x2, y2 = (float(v) for v in f.bbox)
            out.append(FaceDet((x1, y1, x2, y2), float(f.det_score), None if emb is None else np.asarray(emb, dtype=np.float32)))
        return out
