import ipaddress

from edge.discover import find_cameras, local_networks
from edge.sources import choose, is_auto


def test_website_choice_wins_then_env_then_network() -> None:
    found = ["http://192.168.1.20:8080/video", "http://192.168.1.31:8081/video"]
    assert choose("gate", {"gate": "http://10.0.0.5:8080/video"}, "auto", found, set()) == "http://10.0.0.5:8080/video"
    assert choose("gate", {}, "http://10.0.0.9:8080/video", found, set()) == "http://10.0.0.9:8080/video"
    assert choose("gate", {}, "auto", found, set()) == found[0]
    assert choose("inside", {}, "AUTO", found, {found[0]}) == found[1]  # never the door's camera
    assert choose("inside", {}, "auto", [], set()) == ""  # nothing found yet: wait
    assert is_auto(" Auto ") and not is_auto("0")


def test_only_private_lan_networks_are_searched() -> None:
    nets = local_networks(["192.168.219.104", "127.0.0.1", "169.254.3.4", "8.8.8.8", "10.1.2.3", "192.168.219.7"])
    assert nets == [ipaddress.IPv4Network("192.168.219.0/24"), ipaddress.IPv4Network("10.1.2.0/24")]


def test_find_cameras_keeps_only_real_streams_sorted_by_address() -> None:
    net = [ipaddress.IPv4Network("192.168.5.0/29")]  # hosts .1 - .6
    open_ports = {("192.168.5.6", 8080), ("192.168.5.2", 8081), ("192.168.5.3", 8080)}
    streams = {("192.168.5.6", 8080): "http://192.168.5.6:8080/video", ("192.168.5.2", 8081): "http://192.168.5.2:8081/video"}
    found = find_cameras(net, skip=["192.168.5.1"], opener=lambda h, p: (h, p) in open_ports,
                         prober=lambda h, p: streams.get((h, p)))  # .3:8080 is open but is not a camera
    assert found == ["http://192.168.5.2:8081/video", "http://192.168.5.6:8080/video"]


def test_placeholder_addresses_from_the_website_are_ignored() -> None:
    from edge.geometry_sync import stream_choices

    rows = [{"kind": "gate", "stream_url": "http://<phone-1-ip>:8080/video"}, {"kind": "inside", "stream_url": "0"},
            {"kind": "gate", "stream_url": None}]
    assert stream_choices(rows) == {}
    assert stream_choices([{"kind": "inside", "stream_url": "http://10.0.0.7:8081/video"}]) == {"inside": "http://10.0.0.7:8081/video"}
