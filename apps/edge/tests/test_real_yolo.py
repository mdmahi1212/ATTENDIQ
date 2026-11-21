"""Person counting on a real photo with each YOLO model present in models/ (skipped when its weights are missing).

yolo11x is the default counting model (most accurate; ~400 ms per frame on this laptop's CPU, counting runs every
3 s); yolov8n is the light fallback (~35 ms).
"""

from pathlib import Path

import pytest

MODELS = Path(__file__).resolve().parents[1] / "models"


@pytest.mark.parametrize("weights", ["yolo11x.pt", "yolov8n.pt"])
def test_counts_people_in_group_photo_and_roi_filters(weights: str) -> None:
    path = MODELS / weights
    if not path.exists():
        pytest.skip(f"models/{weights} not present")
    from insightface.data import get_image

    from edge.occupancy import YoloPersonDetector, in_roi

    img = get_image("t1")  # InsightFace sample: 6 people side by side
    boxes = YoloPersonDetector(str(path), 0.4)(img)
    assert 5 <= len(boxes) <= 7, len(boxes)
    h, w = img.shape[:2]
    left_half = [(0.0, 0.0), (0.5, 0.0), (0.5, 1.0), (0.0, 1.0)]
    kept = in_roi(boxes, left_half, w, h)
    assert 0 < len(kept) < len(boxes)
