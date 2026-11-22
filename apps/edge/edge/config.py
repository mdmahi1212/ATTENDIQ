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
    inside_camera_source: str = ""  # "" = no inside camera on this node
    yolo_weights: str = "yolo11x.pt"
    outbox_path: str = "./data/outbox.db"
    insightface_home: str = "./models"
    log_level: str = "INFO"


class GateYaml(BaseModel):
    process_every_nth: int = 2
    rotate: int = 0  # clockwise degrees (0/90/180/270) applied to gate frames before detection
    det_size: int = 640
    device: str = "auto"  # face detection + recognition: auto = NVIDIA GPU if it works, else CPU; or "cpu"
    min_face_px: int = 60
    min_det_score: float = 0.6
    line_a: tuple[float, float] = (0.0, 0.55)
    line_b: tuple[float, float] = (1.0, 0.55)
    in_side: int = 1
    min_travel_px: float = 25
    entry_mode: str = "line"
    presence_min_s: float = 0.6
    # Also follow BODIES (YOLO) at the door: someone who walks in with no face ever visible is reported as an
    # unknown entry (LED red). Uses the inside camera's YOLO weights.
    body_tracking: bool = True
    body_min_s: float = 1.0
    # Phone 1 looks along the corridor at people coming in: someone walking OUT gets smaller. False if it looks at
    # the doorway from outside (people walking out get bigger).
    leaving_shrinks: bool = True
    # Photo / screen attack check at the door (InsightFace liveness addon). Tune with the live_score in the logs.
    liveness: bool = True
    live_threshold: float = 0.3
    accept: float = 0.45
    margin: float = 0.08
    min_votes: int = 2

    def to_gate_config(self) -> GateConfig:
        return GateConfig(line_a=self.line_a, line_b=self.line_b, in_side=self.in_side, entry_mode=self.entry_mode,
                          presence_min_s=self.presence_min_s, min_travel_px=self.min_travel_px, min_face_px=self.min_face_px,
                          min_det_score=self.min_det_score,
                          thresholds=Thresholds(accept=self.accept, margin=self.margin, min_votes=self.min_votes),
                          live_threshold=self.live_threshold if self.liveness else None,
                          model_version=f"buffalo_l / thr-{self.accept}")


class InsideYaml(BaseModel):
    enabled: bool = True
    interval_s: float = 3.0          # run YOLO every N seconds
    publish_s: float = 10.0          # OCCUPANCY_UPDATED every N seconds
    conf: float = 0.4
    device: str = "auto"           # auto = NVIDIA GPU if torch has CUDA, else CPU; or "cpu" / "0"
    window: int = 10                 # median over the last N samples
    stable_count_seconds: float = 60.0
    rotate: int = 0
    # Seat area polygon in normalised coords (0..1); people whose feet are outside it are not counted.
    roi: list[tuple[float, float]] = [(0.0, 0.3), (1.0, 0.3), (1.0, 1.0), (0.0, 1.0)]
    # Body ids for exits / door bodies: BoT-SORT + re-identification in YOLO (ids survive people crossing paths).
    # "" = simple box-overlap tracking instead.
    body_tracker: str = "./trackers/botsort-reid.yaml"


class ExitYaml(BaseModel):
    """Exit recognition on the INSIDE camera (placed beside the door, looking into the room).

    A recognised face that crosses the exit line toward the door is a GATE_PERSON_OUT for that student;
    the database marks students whose last door event was OUT as absent when the class is finalized.
    Uses the inside camera's frames and rotation and the gate's thresholds.
    """

    enabled: bool = False
    # line = OUT when a face crosses the exit line toward the door (camera also counts the class).
    # presence = the camera only looks at the way out: every recognised face seen presence_min_s is OUT
    #            (do not also count the class with it - seated students would be marked as leaving).
    mode: str = "line"
    presence_min_s: float = 0.6
    process_every_nth: int = 2
    # Line in normalised coords of the ROTATED inside frame, drawn where people walk to the door.
    # out_side = +1: crossing to the side where side() > 0 (below a left-to-right line, LEFT of a top-to-bottom
    # line) means OUT; -1 the opposite.
    line_a: tuple[float, float] = (0.2, 0.0)
    line_b: tuple[float, float] = (0.2, 1.0)
    out_side: int = 1
    min_travel_px: float = 25
    min_face_px: int = 50
    # Also follow BODIES (YOLO) across the exit line: a student whose face was seen in class is reported OUT even
    # when the face is turned away at the door; an unseen face is reported as "someone left" (needs inside.enabled).
    body_tracking: bool = True
    # Room camera face search on an n x n grid of tiles (2 = 4 tiles): finds back-row faces. 1 = off.
    tiles: int = 2

    def to_gate_config(self, gate: GateYaml) -> GateConfig:
        # GateConfig.in_side names the ROOM side; for an exit-only camera the room is opposite the door side.
        return GateConfig(line_a=self.line_a, line_b=self.line_b, in_side=-self.out_side, entry_mode=self.mode,
                          presence_min_s=self.presence_min_s,
                          count_in=False, min_travel_px=self.min_travel_px, min_face_px=self.min_face_px,
                          min_det_score=gate.min_det_score,
                          thresholds=Thresholds(accept=gate.accept, margin=gate.margin, min_votes=gate.min_votes),
                          model_version=f"buffalo_l / thr-{gate.accept} / exit")


class LiveViewYaml(BaseModel):
    """Live labelled camera view for demos (local web page, frames in RAM only)."""

    enabled: bool = False
    host: str = "127.0.0.1"  # local only; do not expose students' faces on the network
    port: int = 8090
    fps: float = 10.0


class EdgeYaml(BaseModel):
    room_code: str | None = None
    liveview: LiveViewYaml = LiveViewYaml()
    gate: GateYaml = GateYaml()
    inside: InsideYaml = InsideYaml()
    exit: ExitYaml = ExitYaml()
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
