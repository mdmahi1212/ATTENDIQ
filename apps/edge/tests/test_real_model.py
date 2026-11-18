"""Gate pipeline with the REAL InsightFace model on a synthetic walk (skipped if the model is not downloaded)."""

import uuid
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import pytest

from attendiq_common.envelope import Envelope
from edge.gallery import Gallery
from edge.gate import GateConfig, GatePipeline

MODEL_ROOT = Path(__file__).resolve().parents[2] / "face-api" / "models"
pytestmark = pytest.mark.skipif(not (MODEL_ROOT / "models" / "buffalo_l" / "det_10g.onnx").exists(),
                                reason="buffalo_l not downloaded (run apps/face-api once)")


@pytest.fixture(scope="module")
def detector():  # noqa: ANN201
    from edge.detector import InsightFaceDetector

    return InsightFaceDetector(MODEL_ROOT, 640)


@pytest.fixture(scope="module")
def faces():  # noqa: ANN201
    """Two different people from InsightFace's bundled group photo, as 1.4x-upscaled crops."""
    import cv2
    from insightface.data import get_image

    img = get_image("t1")
    from edge.detector import InsightFaceDetector

    dets = sorted(InsightFaceDetector(MODEL_ROOT, 640)(img), key=lambda d: d.box[0])
    crops = []
    for d in dets[:2]:
        x1, y1, x2, y2 = (int(v) for v in d.box)
        w, h = x2 - x1, y2 - y1
        c = img[max(0, y1 - h // 2): y2 + h // 2, max(0, x1 - w // 2): x2 + w // 2]
        crops.append(cv2.resize(c, None, fx=1.4, fy=1.4, interpolation=cv2.INTER_CUBIC))
    return crops


def frames_walking(crop: np.ndarray, n: int = 14, h: int = 720, w: int = 960) -> list[np.ndarray]:
    """The face moves from the top third to the bottom third of the frame (crosses y = 0.5)."""
    out = []
    ch, cw = crop.shape[:2]
    for i in range(n):
        f = np.full((h, w, 3), 90, np.uint8)
        y = int(40 + i * (h - ch - 80) / (n - 1))
        x = (w - cw) // 2
        f[y: y + ch, x: x + cw] = crop
        out.append(f)
    return out


def run(detector, gallery_data: dict, crop: np.ndarray) -> list[Envelope]:  # noqa: ANN001
    events: list[Envelope] = []
    pipe = GatePipeline(GateConfig(line_a=(0, 0.5), line_b=(1, 0.5), in_side=1), Gallery(),
                        uuid.uuid4(), events.append, clock=lambda: datetime.now(UTC))
    pipe.start(uuid.uuid4(), gallery_data)
    t = 0.0
    for f in frames_walking(crop):
        pipe.process(detector(f), f.shape[1], f.shape[0], t)
        t += 0.15
    for _ in range(12):
        pipe.process([], 960, 720, t)
        t += 0.15
    return events


def test_enrolled_face_walking_in_is_recognised(detector, faces) -> None:  # noqa: ANN001
    import cv2

    enrolled = detector(cv2.flip(faces[0], 1))[0].embedding  # "enrollment" photo: mirrored copy
    gallery = {"students": [{"id": "stu-0", "embeddings": [enrolled.tolist()]},
                            {"id": "stu-1", "embeddings": [detector(faces[1])[0].embedding.tolist()]}]}
    evs = run(detector, {"students": gallery["students"]}, faces[0])
    kinds = [e.event_type.value for e in evs]
    assert kinds == ["GATE_PERSON_IN", "GATE_ENTRY_RECOGNISED"], kinds
    assert evs[1].payload["student_id"] == "stu-0" and evs[1].payload["score"] > 0.6


def test_face_not_in_gallery_is_unknown(detector, faces) -> None:  # noqa: ANN001
    gallery = {"students": [{"id": "stu-1", "embeddings": [detector(faces[1])[0].embedding.tolist()]}]}
    kinds = [e.event_type.value for e in run(detector, gallery, faces[0])]
    assert kinds == ["GATE_PERSON_IN", "GATE_ENTRY_UNKNOWN"], kinds
