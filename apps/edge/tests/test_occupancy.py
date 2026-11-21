from edge.occupancy import OccupancyCounter, in_roi, point_in_polygon

SEATS = [(0.1, 0.4), (0.9, 0.4), (0.9, 1.0), (0.1, 1.0)]  # lower part of the frame


def test_point_in_polygon() -> None:
    sq = [(0, 0), (10, 0), (10, 10), (0, 10)]
    assert point_in_polygon((5, 5), sq) and not point_in_polygon((15, 5), sq) and not point_in_polygon((5, -1), sq)


def test_roi_uses_bottom_centre() -> None:
    w, h = 1000, 1000
    seated = (300, 500, 400, 900)  # feet at y=900 inside
    door = (0, 50, 80, 350)  # standing at the door, feet at y=350 above the seat area
    head_in_but_feet_out = (950, 300, 1000, 990)  # centre x=975 outside (x > 0.9)
    assert in_roi([seated, door, head_in_but_feet_out], SEATS, w, h) == [seated]
    assert len(in_roi([seated, door], None, w, h)) == 2  # no ROI = count all


def test_median_absorbs_brief_occlusion() -> None:
    c = OccupancyCounter(window=5, stable_seconds=60)
    vals = [20, 20, 20, 17, 20, 20]  # 3 people hidden for one sample
    out = [c.add(v, t * 3).smoothed for t, v in enumerate(vals)]
    assert out[-1] == 20 and min(out) == 20


def test_stable_after_unchanged_for_stable_seconds() -> None:
    c = OccupancyCounter(window=3, stable_seconds=60)
    t = 0.0
    s = c.add(10, t)
    assert not s.stable
    for _ in range(20):
        t += 3
        s = c.add(10, t)
    assert s.stable and s.smoothed == 10
    for _ in range(2):  # the count really changes: not stable again until 60 s pass
        t += 3
        s = c.add(14, t)
    assert s.smoothed == 14 and not s.stable


def test_reset() -> None:
    c = OccupancyCounter()
    c.add(5, 0)
    c.reset()
    assert c.add(1, 1).smoothed == 1


def test_device_auto_uses_the_gpu_only_when_torch_has_cuda() -> None:
    import torch

    from edge.occupancy import resolve_device

    assert resolve_device("cpu") == "cpu" and resolve_device("0") == "0"
    assert resolve_device("auto") == ("0" if torch.cuda.is_available() else "cpu")


def test_face_detector_device_choice() -> None:
    import onnxruntime as ort
    import torch

    from edge.detector import CPU, GPU, face_providers

    assert face_providers("cpu") == CPU
    gpu_ok = torch.cuda.is_available() and "CUDAExecutionProvider" in ort.get_available_providers()
    assert face_providers("auto") == (GPU if gpu_ok else CPU)
