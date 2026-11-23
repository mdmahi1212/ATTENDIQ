"""Which address each camera uses: the website's choice > an address written in .env > found on the network."""

from __future__ import annotations

AUTO = "auto"


def is_auto(value: str | None) -> bool:
    return (value or "").strip().lower() == AUTO


def choose(kind: str, website: dict[str, str], env_value: str, found: list[str], taken: set[str]) -> str:
    """Address for the door ("gate") or room ("inside") camera; "" = none known yet.

    website: kind -> stream address picked on the website (Operator -> camera); env_value: GATE/INSIDE_CAMERA_SOURCE
    ("auto" = use the website choice or the network search); found: cameras found on the network; taken: addresses
    the other camera already uses (two phones never get the same address)."""
    picked = (website.get(kind) or "").strip()
    if picked:
        return picked
    if env_value and not is_auto(env_value):
        return env_value
    for url in found:  # door gets the first free camera, the room the next one; swap them on the website
        if url not in taken:
            return url
    return ""
