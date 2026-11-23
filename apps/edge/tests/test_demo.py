from pathlib import Path

from edge.demo import class_minutes, find_pairs


def test_finds_door_room_pairs_by_shared_ending(tmp_path: Path) -> None:
    for name in ("door.mp4", "Room.MP4", "door5.mov", "room5.mov", "door_x.mp4", "notes.txt", "room7.mp4"):
        (tmp_path / name).write_bytes(b"")
    pairs = find_pairs(tmp_path)
    assert [(p.name, p.door.name, p.room.name) for p in pairs] == [("", "door.mp4", "Room.MP4"), ("5", "door5.mov", "room5.mov")]


def test_missing_folder_has_no_pairs(tmp_path: Path) -> None:
    assert find_pairs(tmp_path / "nope") == []


def test_class_length_matches_the_recording() -> None:
    assert class_minutes(4.75 * 60) == 5
    assert class_minutes(6 * 60) == 6  # a 6-minute video -> a 6-minute class
    assert class_minutes(6 * 60 + 2) == 6  # a few seconds over still fits
    assert class_minutes(6 * 60 + 20) == 7
    assert class_minutes(9.5 * 60) == 10
    assert class_minutes(30 * 60) == 15  # longest demo class
