"""InsightFace (SCRFD + ArcFace, buffalo_l) as a FaceDet detector. Same model as apps/face-api.

Runs on the NVIDIA GPU when onnxruntime-gpu and the CUDA build of torch are installed (requirements-gpu.txt),
otherwise on the CPU. Same weights either way, so recognition scores do not change.
"""

from __future__ import annotations

import logging
from pathlib import Path

import numpy as np

from edge.gate import FaceDet

log = logging.getLogger("edge.detector")

CPU = ["CPUExecutionProvider"]
GPU = ["CUDAExecutionProvider", "CPUExecutionProvider"]


def face_providers(device: str = "auto") -> list[str]:
    """ONNX Runtime providers for 'auto' (GPU if it really works, else CPU), 'cpu' or 'cuda'."""
    if device == "cpu":
        return CPU
    try:
        import onnxruntime as ort
        import torch  # CUDA build of torch ships the CUDA/cuDNN DLLs; must be imported before preload_dlls()

        if torch.cuda.is_available() and "CUDAExecutionProvider" in ort.get_available_providers():
            ort.preload_dlls()
            return GPU
    except (ImportError, OSError, AttributeError) as exc:
        log.info("face detector: GPU unavailable (%s), using CPU", exc)
    return CPU


class InsightFaceDetector:
    def __init__(self, root: Path, det_size: int = 640, model: str = "buffalo_l", device: str = "auto",
                 liveness: bool = False) -> None:
        from insightface.app import FaceAnalysis

        providers = face_providers(device)
        # liveness: InsightFace's passive anti-spoofing addon (the face API's liveness.onnx under the same root);
        # "observe" = every face keeps its embedding and gets a live_score, the gate decides what a spoof means.
        extra = {"addons": ["liveness"], "liveness_mode": "observe"} if liveness else {}
        self._app = FaceAnalysis(name=model, root=str(root), allowed_modules=["detection", "recognition"],
                                 providers=providers, **extra)
        self._app.prepare(ctx_id=0 if providers is GPU else -1, det_size=(det_size, det_size))
        # What the sessions actually run on (a provider can be listed but fail to load).
        used = {p for m in self._app.models.values() for p in m.session.get_providers()}
        self.device = "GPU" if "CUDAExecutionProvider" in used else "CPU"

    def __call__(self, frame: np.ndarray, tiles: int = 1) -> list[FaceDet]:
        """tiles > 1: search an n x n grid of overlapping tiles of the full-resolution frame, so small faces far away
        (back row) are found at more detail than when the whole frame is shrunk to det_size."""
        if tiles <= 1:
            return self._detect(frame)
        h, w = frame.shape[:2]
        th, tw = h // tiles, w // tiles
        oy, ox = th // 6, tw // 6  # overlap: a face on a tile border is still whole in one tile
        found: list[FaceDet] = []
        for r in range(tiles):
            for c in range(tiles):
                y0, x0 = max(0, r * th - oy), max(0, c * tw - ox)
                y1, x1 = min(h, (r + 1) * th + oy), min(w, (c + 1) * tw + ox)
                for f in self._detect(frame[y0:y1, x0:x1]):
                    b = f.box
                    found.append(FaceDet((b[0] + x0, b[1] + y0, b[2] + x0, b[3] + y0), f.det_score, f.embedding, f.live_score))
        return merge_faces(found)

    def _detect(self, frame: np.ndarray) -> list[FaceDet]:
        out: list[FaceDet] = []
        for f in self._app.get(frame):
            emb = getattr(f, "normed_embedding", None)
            x1, y1, x2, y2 = (float(v) for v in f.bbox)
            lv = getattr(f, "liveness", None)
            live = lv.get("live_score") if isinstance(lv, dict) else None
            out.append(FaceDet((x1, y1, x2, y2), float(f.det_score), None if emb is None else np.asarray(emb, dtype=np.float32),
                               None if live is None else float(live)))
        return out


def merge_faces(faces: list[FaceDet], iou_max: float = 0.4) -> list[FaceDet]:
    """Faces found twice in overlapping tiles: keep the higher detection score."""
    from edge.geometry import iou

    kept: list[FaceDet] = []
    for f in sorted(faces, key=lambda x: -x.det_score):
        if all(iou(f.box, k.box) < iou_max for k in kept):
            kept.append(f)
    return kept
