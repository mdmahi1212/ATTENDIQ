from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app

ROOT = Path(__file__).resolve().parent.parent
SECRET = "test-secret-0123456789"


@dataclass
class FakeFace:
    bbox: np.ndarray
    det_score: float
    _emb: np.ndarray = field(default_factory=lambda: _unit(512, 1))
    liveness: dict | None = None

    @property
    def normed_embedding(self) -> np.ndarray:
        return self._emb


def _unit(n: int, seed: int) -> np.ndarray:
    v = np.random.default_rng(seed).normal(size=n).astype(np.float32)
    return v / np.linalg.norm(v)


class FakeEngine:
    """Returns whatever faces the test queued; no model needed."""

    model_name = "fake"

    def __init__(self) -> None:
        self.next_faces: list[FakeFace] = []

    def detect(self, img: np.ndarray) -> list[FakeFace]:
        return self.next_faces


def jpeg(img: np.ndarray) -> bytes:
    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 95])
    assert ok
    return buf.tobytes()


def sharp_image(w: int = 320, h: int = 320) -> np.ndarray:
    """High-frequency texture so the Laplacian sharpness check passes."""
    rng = np.random.default_rng(7)
    return rng.integers(0, 255, size=(h, w, 3), dtype=np.uint8)


@pytest.fixture
def settings() -> Settings:
    return Settings(face_api_secret=SECRET, max_images_per_request=3, max_image_bytes=500_000)


@pytest.fixture
def fake_engine() -> FakeEngine:
    return FakeEngine()


@pytest.fixture
def client(settings: Settings, fake_engine: FakeEngine):
    app = create_app(engine_factory=lambda _s: fake_engine, settings=settings)
    with TestClient(app) as c:
        yield c
