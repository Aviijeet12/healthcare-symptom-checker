"""Lightweight backend smoke test.

Usage:
    cd healthcare-backend
    python tests/smoke_test.py
"""

# ruff: noqa: E402

from __future__ import annotations

import json
import os
import sys


_BACKEND_ROOT = os.path.dirname(os.path.dirname(__file__))
if _BACKEND_ROOT not in sys.path:
    sys.path.insert(0, _BACKEND_ROOT)

from app import app


def test_health_endpoint() -> None:
    with app.test_client() as client:
        response = client.get("/")
        assert response.status_code == 200, "Health endpoint should return 200"
        payload = response.get_json()
        assert payload["status"] == "running"
        assert "analyze" in payload["endpoints"]


def main() -> None:
    failures = []
    try:
        test_health_endpoint()
    except AssertionError as exc:  # pragma: no cover
        failures.append(str(exc))

    if failures:
        raise SystemExit("\n".join(failures))

    print(json.dumps({"status": "ok", "tests": 1}))


if __name__ == "__main__":
    main()
