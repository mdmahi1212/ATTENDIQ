from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel
from pydantic_settings import BaseSettings, SettingsConfigDict

from edge.decision import Thresholds
from edge.gate import GateConfig

ROOT = Path(__file__).resolve().parent.parent


class Env(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT / ".env", extra="ignore")
    room_code: str = "B204"
    edge_config_path: str = "./config.yaml"
    edge_device_id: str
    edge_device_key: str
    api_base_url: str
    mqtt_host: str = "127.0.0.1"
    mqtt_port: int = 1883
    mqtt_username: str = ""
    mqtt_password: str = ""
    mqtt_client_id: str = "edge-B204"
    mqtt_tls: bool = False
    mqtt_ca_file: str = ""
    gate_camera_source: str = "0"
    outbox_path: str = "./data/outbox.db"
    insightface_home: str = "./models"
    log_level: str = "INFO"


class GateYaml(BaseModel):
    process_every_nth: int = 2
    rotate: int = 0  # clockwise degrees (0/90/180/270) applied to gate frames before detection
    det_size: int = 640
    min_face_px: int = 60
    min_det_score: float = 0.6
    line_a: tuple[float, float] = (0.0, 0.55)
    line_b: tuple[float, float] = (1.0, 0.55)
    in_side: int = 1
    min_travel_px: float = 25
    entry_mode: str = "line"
    presence_min_s: float = 0.6
    accept: float = 0.45
    margin: float = 0.08
    min_votes: int = 2

    def to_gate_config(self) -> GateConfig:
        return GateConfig(line_a=self.line_a, line_b=self.line_b, in_side=self.in_side, entry_mode=self.entry_mode,
                          presence_min_s=self.presence_min_s, min_travel_px=self.min_travel_px, min_face_px=self.min_face_px,
                          min_det_score=self.min_det_score,
                          thresholds=Thresholds(accept=self.accept, margin=self.margin, min_votes=self.min_votes),
                          model_version=f"buffalo_l / thr-{self.accept}")


class EdgeYaml(BaseModel):
    room_code: str | None = None
    gate: GateYaml = GateYaml()
    heartbeat_seconds: float = 15
    gallery_refresh_seconds: float = 60
    control_poll_seconds: float = 15


def resolve(p: str) -> Path:
    path = Path(p)
    return path if path.is_absolute() else ROOT / path


def load_yaml(path: str) -> EdgeYaml:
    f = resolve(path)
    if not f.exists():
        f = ROOT / "config.example.yaml"
    data: dict[str, Any] = yaml.safe_load(f.read_text(encoding="utf-8")) or {}
    return EdgeYaml.model_validate(data)
