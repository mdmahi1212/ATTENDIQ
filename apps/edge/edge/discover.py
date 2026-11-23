"""Finds phone cameras on the laptop's own Wi-Fi network, so no camera address has to be typed anywhere.

Scans every private IPv4 /24 network the laptop is on for the ports the usual phone camera apps use
(IP Webcam 8080, IP Camera Lite 8081, DroidCam 4747) and keeps only addresses that really answer with an
MJPEG / JPEG stream. Runs in the background; a scan of one /24 takes a few seconds.
"""

from __future__ import annotations

import ipaddress
import logging
import socket
from collections.abc import Callable, Iterable
from concurrent.futures import ThreadPoolExecutor

log = logging.getLogger("edge.discover")

PORTS = (8080, 8081, 4747)
PATHS = ("/video", "/mjpegfeed", "/live", "/")
STREAM_TYPES = ("multipart/x-mixed-replace", "image/jpeg")


def local_networks(addresses: Iterable[str] | None = None) -> list[ipaddress.IPv4Network]:
    """Private /24 networks of this machine's IPv4 addresses (Wi-Fi, Ethernet), loopback and link-local skipped."""
    if addresses is None:
        addresses = _my_addresses()
    nets: list[ipaddress.IPv4Network] = []
    for a in addresses:
        try:
            ip = ipaddress.IPv4Address(a)
        except ValueError:
            continue
        if ip.is_private and not ip.is_loopback and not ip.is_link_local:
            net = ipaddress.IPv4Network(f"{ip}/24", strict=False)
            if net not in nets:
                nets.append(net)
    return nets


def _my_addresses() -> list[str]:
    out: list[str] = []
    try:
        import psutil

        for addrs in psutil.net_if_addrs().values():
            out += [a.address for a in addrs if a.family == socket.AF_INET]
    except Exception:  # noqa: BLE001 - psutil missing or blocked: fall back to the default route's address
        pass
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("10.255.255.255", 1))  # no packet is sent; picks the outgoing interface
            out.append(s.getsockname()[0])
    except OSError:
        pass
    return out


def port_open(host: str, port: int, timeout: float = 0.35) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def stream_url(host: str, port: int, timeout: float = 2.0) -> str | None:
    """The first path on host:port that answers with an MJPEG / JPEG stream, else None."""
    import httpx

    for path in PATHS:
        url = f"http://{host}:{port}{path}"
        try:
            with httpx.stream("GET", url, timeout=timeout) as r:
                ctype = r.headers.get("content-type", "").lower()
                if r.status_code == 200 and ctype.startswith(STREAM_TYPES):
                    return url
        except httpx.HTTPError:
            continue
    return None


def find_cameras(networks: list[ipaddress.IPv4Network] | None = None, skip: Iterable[str] = (),
                 opener: Callable[[str, int], bool] = port_open,
                 prober: Callable[[str, int], str | None] = stream_url) -> list[str]:
    """Stream URLs of the phone cameras on the given (default: this machine's) networks, sorted by address."""
    nets = local_networks() if networks is None else networks
    me = set(skip) | set(_my_addresses() if networks is None else [])
    hosts = [str(h) for n in nets for h in n.hosts() if str(h) not in me]
    with ThreadPoolExecutor(max_workers=128) as pool:
        open_ports = [hp for hp, ok in zip(((h, p) for h in hosts for p in PORTS),
                                           pool.map(lambda hp: opener(*hp), ((h, p) for h in hosts for p in PORTS)),
                                           strict=True) if ok]
        urls = list(pool.map(lambda hp: prober(*hp), open_ports))
    found = sorted({u for u in urls if u}, key=lambda u: tuple(int(x) for x in u.split("//")[1].split(":")[0].split(".")))
    if found:
        log.info("cameras found on the network: %s", ", ".join(found))
    return found
