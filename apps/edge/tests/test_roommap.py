from edge.roommap import room_people


def test_people_positions_are_feet_points_with_known_students_only() -> None:
    names = {7: "stu-a"}
    p = room_people([(100, 100, 200, 400), (500, 50, 640, 480)], [7, 8], 640, 480, names.get)
    assert p == [{"x": 0.234, "y": 0.833, "student_id": "stu-a"}, {"x": 0.891, "y": 1.0}]


def test_without_tracker_ids_positions_only() -> None:
    assert room_people([(0, 0, 64, 48)], None, 640, 480, None) == [{"x": 0.05, "y": 0.1}]
