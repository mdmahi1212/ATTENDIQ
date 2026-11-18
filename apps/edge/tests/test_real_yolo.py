"""YOLOv8n person counting on a real photo (skipped when the weights are not downloaded)."""

from pathlib import Path

import pytest

WEIGHTS = Path(__file__).resolve().parents[1] / "models" / "yolov8n.pt"
pytestmark = pytest.mark.skipif(not WEIGHTS.exists(), reason="models/yolov8n.pt not downloaded")


def test_counts_people_in_group_photo_and_roi_filters() -> None:
    from insightface.data import get_image

    from edge.occupancy import YoloPersonDetector, in_roi

    img = get_image("t1")  # InsightFace sample: 6 people side by side
    boxes = YoloPersonDetector(str(WEIGHTS), 0.4)(img)
    assert 5 <= len(boxes) <= 7, len(boxes)
    h, w = img.shape[:2]
    left_half = [(0.0, 0.0), (0.5, 0.0), (0.5, 1.0), (0.0, 1.0)]
    kept = in_roi(boxes, left_half, w, h)
    assert 0 < len(kept) < len(boxes)
