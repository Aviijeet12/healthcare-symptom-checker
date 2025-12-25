"""Optional Redis seeded-analysis test.

Run:
  - Start redis: docker compose up -d redis
  - Seed data:   pnpm backend:seed
  - Test:        pnpm test:backend:redis

This test is intentionally opt-in because it requires Redis.
"""

from __future__ import annotations

import hashlib
import json
import os
import sys


_BACKEND_ROOT = os.path.dirname(os.path.dirname(__file__))
if _BACKEND_ROOT not in sys.path:
    sys.path.insert(0, _BACKEND_ROOT)

from app import app  # noqa: E402


def _normalize_symptoms(text: str) -> str:
    return " ".join((text or "").strip().lower().split())


def _seed_key(prefix: str, symptoms: str) -> str:
    normalized = _normalize_symptoms(symptoms)
    digest = hashlib.sha256(normalized.encode("utf-8")).hexdigest()
    return f"{prefix}:{digest}"


def main() -> None:
    redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    prefix = os.getenv("REDIS_SEED_PREFIX", "symptom-checker:seed")

    try:
        import redis  # type: ignore
    except Exception as exc:  # noqa: BLE001
        raise SystemExit("Missing python package 'redis'. Run pnpm backend:install") from exc

    symptoms = "Fever, sore throat, cough for 2 days"
    expected_key = _seed_key(prefix, symptoms)

    client = redis.Redis.from_url(redis_url, decode_responses=True)
    raw = client.get(expected_key)
    assert raw, f"Expected seed key missing in Redis: {expected_key}"
    seeded = json.loads(raw)

    os.environ["REDIS_SEEDED_ANALYSIS_ENABLED"] = "1"

    with app.test_client() as client_http:
        response = client_http.post("/analyze", json={"symptoms": symptoms})
        assert response.status_code == 200, response.get_data(as_text=True)
        payload = response.get_json()

    assert payload == seeded

    print(json.dumps({"status": "ok", "tests": 1}))


if __name__ == "__main__":
    main()
