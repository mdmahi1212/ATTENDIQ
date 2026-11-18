"""API contract with a fake engine: auth, limits, response shape."""

from __future__ import annotations

import numpy as np

from tests.conftest import SECRET, FakeFace, jpeg, sharp_image


def files(*blobs: bytes) -> list[tuple[str, tuple[str, bytes, str]]]:
    return [("images", (f"{i}.jpg", b, "image/jpeg")) for i, b in enumerate(blobs)]


def test_health_reports_model(client) -> None:
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "model_loaded": True, "model": "fake", "version": "1.0.0"}


def test_embed_requires_secret(client) -> None:
    body = files(jpeg(sharp_image()))
    assert client.post("/embed", files=body).status_code == 401
    assert client.post("/embed", files=body, headers={"X-Face-Api-Secret": "wrong"}).status_code == 401


def test_good_face_returns_unit_512_embedding(client, fake_engine) -> None:
    fake_engine.next_faces = [FakeFace(bbox=np.array([40, 40, 240, 260]), det_score=0.91)]
    r = client.post("/embed", files=files(jpeg(sharp_image())), headers={"X-Face-Api-Secret": SECRET})
    assert r.status_code == 200
    [res] = r.json()
    assert res["ok"] is True
    assert "reason" not in res
    assert len(res["embedding"]) == 512
    assert abs(float(np.linalg.norm(res["embedding"])) - 1.0) < 1e-3
    assert res["face_px"] == 200 and res["det_score"] == 0.91 and res["blur"] > 60


def test_one_result_per_image_in_order(client, fake_engine) -> None:
    fake_engine.next_faces = []
    r = client.post("/embed", files=files(jpeg(sharp_image()), b"not an image"), headers={"X-Face-Api-Secret": SECRET})
    assert [x["reason"] for x in r.json()] == ["no_face", "not_an_image"]


def test_too_many_images_rejected(client) -> None:
    r = client.post("/embed", files=files(*[jpeg(sharp_image())] * 4), headers={"X-Face-Api-Secret": SECRET})
    assert r.status_code == 413


def test_oversized_image_rejected_per_image(client, fake_engine) -> None:
    big = jpeg(np.random.default_rng(1).integers(0, 255, size=(1400, 1400, 3), dtype=np.uint8))
    assert len(big) > 500_000
    r = client.post("/embed", files=files(big), headers={"X-Face-Api-Secret": SECRET})
    assert r.json()[0]["reason"] == "image_too_large"


def test_missing_secret_config_fails_closed(fake_engine) -> None:
    from fastapi.testclient import TestClient

    from app.config import Settings
    from app.main import create_app

    app = create_app(engine_factory=lambda _s: fake_engine, settings=Settings(face_api_secret=""))
    with TestClient(app) as c:
        r = c.post("/embed", files=files(jpeg(sharp_image())), headers={"X-Face-Api-Secret": ""})
        assert r.status_code == 503
