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

    def __call__(self, frame: np.ndarray) -> list[FaceDet]:
        out: list[FaceDet] = []
        for f in self._app.get(frame):
            emb = getattr(f, "normed_embedding", None)
            x1, y1, x2, y2 = (float(v) for v in f.bbox)
            lv = getattr(f, "liveness", None)
            live = lv.get("live_score") if isinstance(lv, dict) else None
            out.append(FaceDet((x1, y1, x2, y2), float(f.det_score), None if emb is None else np.asarray(emb, dtype=np.float32),
                               None if live is None else float(live)))
        return out
