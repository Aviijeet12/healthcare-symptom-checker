"""Seed Redis with deterministic analysis results for local testing.

Usage (recommended):
  - Start Redis (from repo root):
      docker compose up -d redis
  - Seed (from repo root):
      pnpm backend:seed

This script writes keys derived from normalized symptom strings.
"""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path

from dotenv import load_dotenv


def _env_str(name: str, default: str | None = None) -> str | None:
    value = os.getenv(name, default)
    if isinstance(value, str):
        return value.strip()
    return default


def _normalize_symptoms(text: str) -> str:
    return " ".join((text or "").strip().lower().split())


def _seed_key(prefix: str, symptoms: str) -> str:
    normalized = _normalize_symptoms(symptoms)
    digest = hashlib.sha256(normalized.encode("utf-8")).hexdigest()
    return f"{prefix}:{digest}"


def main() -> None:
    backend_dir = Path(__file__).resolve().parent
    load_dotenv(backend_dir / ".env", override=True)

    redis_url = _env_str("REDIS_URL", "redis://localhost:6379/0") or "redis://localhost:6379/0"
    prefix = _env_str("REDIS_SEED_PREFIX", "symptom-checker:seed") or "symptom-checker:seed"

    try:
        import redis  # type: ignore
    except Exception as exc:  # noqa: BLE001
        raise SystemExit(
            "Missing python package 'redis'. Run: pnpm backend:install (or pip install -r healthcare-backend/requirements.txt)"
        ) from exc

    client = redis.Redis.from_url(redis_url, decode_responses=True)

    seed_file = backend_dir / "seed_data.json"
    if not seed_file.exists():
        raise SystemExit(f"Seed file not found: {seed_file}")

    payload = json.loads(seed_file.read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        raise SystemExit("seed_data.json must be a JSON array")

    written = 0
    for item in payload:
        if not isinstance(item, dict):
            continue
        symptoms = item.get("symptoms")
        result = item.get("result")
        if not isinstance(symptoms, str) or not isinstance(result, dict):
            continue
        if not isinstance(result.get("conditions"), list) or not isinstance(result.get("recommendations"), str) or not isinstance(result.get("disclaimer"), str):
            continue

        key = _seed_key(prefix, symptoms)
        try:
            client.set(key, json.dumps(result, ensure_ascii=False))
        except Exception as exc:  # noqa: BLE001
            raise SystemExit(
                "Unable to connect to Redis. Start Redis first (recommended: Docker Desktop + `docker compose up -d redis`), "
                "or point REDIS_URL to a running Redis instance."
            ) from exc
        written += 1

    print(json.dumps({"status": "ok", "written": written, "redis_url": redis_url, "prefix": prefix}))


if __name__ == "__main__":
    main()
