"""Stateless face API: images in -> embeddings + quality out. No database credentials here.

POST /embed   multipart field "images" (1..MAX files), header X-Face-Api-Secret
GET  /health  {status, model_loaded, model, version}
"""

from __future__ import annotations

import hmac
import logging
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Depends, FastAPI, File, Header, HTTPException, Request, UploadFile

from app.config import Settings, get_settings
from app.engine import FaceEngine, InsightFaceEngine
from app.quality import EmbedResult, Limits, decode_image, evaluate

VERSION = "1.0.0"
log = logging.getLogger("face_api")


def create_app(engine_factory: Callable[[Settings], FaceEngine] | None = None, settings: Settings | None = None) -> FastAPI:
    cfg = settings or get_settings()
    log_format = '{"t":"%(asctime)s","lvl":"%(levelname)s","log":"%(name)s","msg":"%(message)s"}'
    logging.basicConfig(level=cfg.log_level, format=log_format)

    def default_factory(s: Settings) -> FaceEngine:
        return InsightFaceEngine(s.insightface_model, s.insightface_home, s.det_size)

    factory = engine_factory or default_factory

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        app.state.engine = factory(cfg)  # loaded once, kept in memory
        yield

    app = FastAPI(title="Smart Attendance face API", version=VERSION, lifespan=lifespan, docs_url=None, redoc_url=None)
    app.state.settings = cfg

    def require_secret(x_face_api_secret: Annotated[str | None, Header()] = None) -> None:
        expected = cfg.face_api_secret
        if not expected:
            raise HTTPException(status_code=503, detail="FACE_API_SECRET is not configured")
        if not x_face_api_secret or not hmac.compare_digest(x_face_api_secret.encode(), expected.encode()):
            raise HTTPException(status_code=401, detail="unauthorized")

    @app.get("/health")
    def health(request: Request) -> dict[str, object]:
        engine = getattr(request.app.state, "engine", None)
        return {
            "status": "ok" if engine else "loading",
            "model_loaded": engine is not None,
            "model": getattr(engine, "model_name", None),
            "version": VERSION,
        }

    @app.post("/embed", dependencies=[Depends(require_secret)])
    def embed(request: Request, images: Annotated[list[UploadFile], File()]) -> list[dict[str, object]]:
        # Sync endpoint: FastAPI runs it in a worker thread, so inference does not block the event loop.
        if not images:
            raise HTTPException(status_code=422, detail="no images")
        if len(images) > cfg.max_images_per_request:
            raise HTTPException(status_code=413, detail=f"at most {cfg.max_images_per_request} images")
        engine: FaceEngine = request.app.state.engine
        limits = Limits(cfg.min_face_px, cfg.min_det_score, cfg.min_blur_laplacian_var)
        results: list[dict[str, object]] = []
        for upload in images:
            data = upload.file.read(cfg.max_image_bytes + 1)
            if len(data) > cfg.max_image_bytes:
                results.append(EmbedResult(ok=False, reason="image_too_large").to_dict())
                continue
            img = decode_image(data)
            if img is None:
                results.append(EmbedResult(ok=False, reason="not_an_image").to_dict())
                continue
            results.append(evaluate(img, engine.detect(img), limits).to_dict())
        ok = sum(1 for r in results if r["ok"])
        log.info("embed images=%d ok=%d", len(results), ok)
        return results

    return app


app = create_app()
