"""Settings from the environment / apps/face-api/.env (see .env.example)."""

from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=Path(__file__).resolve().parent.parent / ".env", extra="ignore")

    face_api_secret: str = Field(default="", min_length=0)
    insightface_model: str = "buffalo_l"
    insightface_home: str = "./models"
    det_size: int = 640

    min_face_px: int = 80
    min_det_score: float = 0.6
    min_blur_laplacian_var: float = 60.0
    max_image_bytes: int = 4_000_000
    max_images_per_request: int = 12
    # Passive anti-spoofing (InsightFace liveness addon): live_score per image, is_live = score >= threshold.
    liveness_enabled: bool = True
    liveness_threshold: float = 0.8

    log_level: str = "INFO"


def get_settings() -> Settings:
    return Settings()
