from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=Path(__file__).resolve().parent.parent / ".env", extra="ignore")

    api_base_url: str
    ingest_device_id: str = ""
    ingest_device_key: str
    room_codes: str = "B204"

    mqtt_host: str = "127.0.0.1"
    mqtt_port: int = 1883
    mqtt_username: str = ""
    mqtt_password: str = ""
    mqtt_client_id: str = "ingest-1"
    mqtt_tls: bool = False
    mqtt_ca_file: str = ""

    batch_max_events: int = 100
    batch_max_wait_ms: int = 1000
    session_poll_seconds: int = 15
    retry_max_backoff_seconds: int = 60
    log_level: str = "INFO"

    @property
    def rooms(self) -> list[str]:
        return [r.strip() for r in self.room_codes.split(",") if r.strip()]
