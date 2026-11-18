"""Gate 7: the full demo.yaml class ends with exactly the scripted statuses after the DB finalizes it.

Live test against the real web API + database (simulation session; only simulated students are touched).
Run: SIM_LIVE=1 .venv/Scripts/python.exe -m pytest tests/test_gate7_live.py -s   (takes ~1-2 min, needs apps/simulator/.env)
"""

import json
import os

import pytest

pytestmark = pytest.mark.skipif(os.environ.get("SIM_LIVE") != "1", reason="live test: set SIM_LIVE=1")


def test_demo_class_ends_with_exact_expected_statuses(capsys) -> None:  # noqa: ANN001
    from simulator.__main__ import main

    code = main(["run", "--direct", "--finalize"])
    out = capsys.readouterr().out.strip().splitlines()[-1]
    result = json.loads(out)
    assert result["state"] in ("ended", "locked")
    assert result["problems"] == [], result["problems"]
    assert result["statuses"] == {"present": 22, "late": 5, "absent": 3}
    assert result["unknown_entries"] == 1
    assert code == 0
