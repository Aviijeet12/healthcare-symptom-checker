"""Flask backend for the Symptom Checker application.

This module lives inside the healthcare-backend/ directory so that the Render
service can target this folder as its root, keeping API credentials isolated
from the frontend.
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from urllib.parse import urlencode
import hashlib

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS

# Load environment variables from .env inside healthcare-backend (optional for local dev)
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

app = Flask(__name__)
CORS(app)

def _env_str(name: str, default: str | None = None) -> str | None:
    value = os.getenv(name, default)
    if isinstance(value, str):
        return value.strip()
    return default


# Gemini API configuration
GEMINI_MODEL = _env_str("GEMINI_MODEL", "gemini-1.5-flash") or "gemini-1.5-flash"

# Prefer v1 (newer). We'll also fall back to v1beta automatically when needed.
GEMINI_API_BASE_URL = _env_str("GEMINI_API_BASE_URL", "https://generativelanguage.googleapis.com/v1") or "https://generativelanguage.googleapis.com/v1"

# When enabled, the backend will return a safe, educational fallback response when
# the LLM provider is unavailable/rate-limited, instead of failing the request.
RETURN_FALLBACK_ON_LLM_ERROR = os.getenv("RETURN_FALLBACK_ON_LLM_ERROR", "1").lower() in {
    "1",
    "true",
    "yes",
    "y",
    "on",
}


# Hugging Face Inference Providers (OpenAI-compatible) configuration
# Note: api-inference.huggingface.co has been deprecated in favor of router.huggingface.co
HF_ROUTER_BASE_URL = _env_str("HF_BASE_URL", "https://router.huggingface.co/v1") or "https://router.huggingface.co/v1"


def _env_float(name: str, default: float) -> float:
    value = _env_str(name)
    if value is None:
        return default
    try:
        parsed = float(value)
        if not (parsed == parsed):  # NaN
            return default
        return parsed
    except Exception:
        return default


def _env_int(name: str, default: int) -> int:
    value = _env_str(name)
    if value is None:
        return default
    try:
        return int(float(value))
    except Exception:
        return default


def _hf_chat_url(base_url: str) -> str:
    return f"{base_url.rstrip('/')}/chat/completions"


def _post_hf(payload: dict, *, base_url: str, api_key: str, timeout_s: float) -> requests.Response:
    return requests.post(
        _hf_chat_url(base_url),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=timeout_s,
    )


def _parse_retry_after_seconds(response: requests.Response) -> float | None:
    value = response.headers.get("retry-after")
    if not value:
        return None
    try:
        seconds = float(value)
        if seconds < 0:
            return None
        return seconds
    except Exception:
        return None


def _extract_hf_error(response_json: object) -> tuple[str | None, float | None]:
    if not isinstance(response_json, dict):
        return None, None
    message = response_json.get("error") if isinstance(response_json.get("error"), str) else None
    estimated = response_json.get("estimated_time") if isinstance(response_json.get("estimated_time"), (int, float)) else None
    try:
        estimated_seconds = float(estimated) if estimated is not None else None
    except Exception:
        estimated_seconds = None
    return message, estimated_seconds


def _extract_hf_text(response_json: object) -> str:
    # OpenAI-compatible router response: {"choices": [{"message": {"content": "..."}}]}
    if isinstance(response_json, dict):
        choices = response_json.get("choices")
        if isinstance(choices, list) and choices:
            first = choices[0]
            if isinstance(first, dict):
                message = first.get("message")
                if isinstance(message, dict) and isinstance(message.get("content"), str):
                    return message["content"]
    raise ValueError("Unexpected Hugging Face router response format")


def _post_hf_with_resilience(
    payload: dict,
    *,
    base_url: str,
    api_key: str,
    timeout_s: float,
) -> requests.Response:
    """Call Hugging Face Inference API with retries, rate-limit backoff, and model-loading polling."""

    max_retries = max(0, min(_env_int("HF_MAX_RETRIES", 3), 6))
    min_backoff_s = max(0.1, min(_env_float("HF_MIN_BACKOFF_S", 0.4), 10.0))
    max_backoff_s = max(0.5, min(_env_float("HF_MAX_BACKOFF_S", 8.0), 60.0))
    wait_for_model_max_ms = max(0, min(_env_int("HF_WAIT_FOR_MODEL_MAX_MS", 25000), 120000))

    def backoff(attempt: int) -> float:
        exp = min_backoff_s * (2 ** max(0, attempt - 1))
        jitter = 0.75 + (0.5 * (time.time() % 1))
        return min(max_backoff_s, exp * jitter)

    started = time.time()
    attempt = 0
    while True:
        attempt += 1
        t0 = time.time()
        resp = _post_hf(payload, base_url=base_url, api_key=api_key, timeout_s=timeout_s)
        latency_ms = int((time.time() - t0) * 1000)

        # Parse JSON for error handling when possible.
        resp_json: object | None = None
        try:
            if resp.headers.get("content-type", "").startswith("application/json"):
                resp_json = resp.json()
        except Exception:
            resp_json = None

        if resp.status_code == 401:
            raise PermissionError("Unauthorized: invalid HF_API_KEY")

        if resp.status_code == 403:
            raise PermissionError(
                "Forbidden: token may not have access to this model (gated/private) or lacks inference permissions"
            )

        if resp.status_code == 429:
            retry_after = _parse_retry_after_seconds(resp)
            if attempt > max_retries + 1:
                return resp
            delay = retry_after if retry_after is not None else backoff(attempt)
            print(f"[hf] 429 rate-limited (latency={latency_ms}ms) retry_in={delay:.2f}s attempt={attempt}")
            time.sleep(delay)
            continue

        # Model loading: often 503 with {error: 'loading', estimated_time: ...}
        if resp.status_code == 503 and wait_for_model_max_ms > 0 and resp_json is not None:
            message, estimated_s = _extract_hf_error(resp_json)
            if message and "loading" in message.lower():
                elapsed_ms = int((time.time() - started) * 1000)
                remaining_ms = wait_for_model_max_ms - elapsed_ms
                if remaining_ms <= 0:
                    return resp

                suggested_ms = int((estimated_s or 1.2) * 1000)
                delay_ms = max(400, min(6000, min(suggested_ms, remaining_ms)))
                print(f"[hf] model loading; polling again in {delay_ms}ms (elapsed={elapsed_ms}ms)")
                time.sleep(delay_ms / 1000.0)
                continue

        # Retry transient upstream errors.
        if resp.status_code in (500, 502, 503, 504) and attempt <= max_retries:
            delay = backoff(attempt)
            print(f"[hf] upstream {resp.status_code} (latency={latency_ms}ms) retry_in={delay:.2f}s attempt={attempt}")
            time.sleep(delay)
            continue

        return resp


def _parse_llm_json_output(text: str) -> dict:
    cleaned = (text or "").strip()
    if not cleaned:
        raise ValueError("Empty model output")

    if "```json" in cleaned:
        json_str = cleaned.split("```json", 1)[1].split("```", 1)[0].strip()
        return json.loads(json_str)
    if "```" in cleaned:
        json_str = cleaned.split("```", 1)[1].split("```", 1)[0].strip()
        return json.loads(json_str)

    # Try to extract first JSON object if extra text slips through.
    if "{" in cleaned and "}" in cleaned:
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start >= 0 and end > start:
            try:
                return json.loads(cleaned[start : end + 1])
            except Exception:
                pass

    return json.loads(cleaned)


def _env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "y", "on"}


def _normalize_symptoms(text: str) -> str:
    return " ".join((text or "").strip().lower().split())


def _redis_seed_key(prefix: str, symptoms: str) -> str:
    normalized = _normalize_symptoms(symptoms)
    digest = hashlib.sha256(normalized.encode("utf-8")).hexdigest()
    return f"{prefix}:{digest}"


def _try_get_seeded_result(symptoms: str) -> dict | None:
    if not _env_bool("REDIS_SEEDED_ANALYSIS_ENABLED", False):
        return None

    redis_url = _env_str("REDIS_URL", "redis://localhost:6379/0") or "redis://localhost:6379/0"
    prefix = _env_str("REDIS_SEED_PREFIX", "symptom-checker:seed") or "symptom-checker:seed"

    try:
        import redis  # type: ignore
    except Exception:
        # Redis isn't available in the environment; treat as no seed.
        return None

    try:
        client = redis.Redis.from_url(redis_url, decode_responses=True)
        raw = client.get(_redis_seed_key(prefix, symptoms))
        if not raw:
            return None
        parsed = json.loads(raw)
        if not isinstance(parsed, dict):
            return None
        if not isinstance(parsed.get("conditions"), list):
            return None
        if not isinstance(parsed.get("recommendations"), str):
            return None
        if not isinstance(parsed.get("disclaimer"), str):
            return None
        return {
            "conditions": parsed["conditions"],
            "recommendations": parsed["recommendations"],
            "disclaimer": parsed["disclaimer"],
        }
    except Exception:
        return None


def _fallback_result(reason: str) -> dict:
    return {
        "error": "AI analysis temporarily unavailable",
        "code": "LLM_FALLBACK",
        "reason": reason,
        "conditions": ["AI analysis temporarily unavailable"],
        "recommendations": (
            "We couldn't run the AI analysis right now (service is busy). "
            "If symptoms are severe, worsening, or include chest pain, trouble breathing, confusion, fainting, "
            "or signs of stroke, seek urgent medical care. Otherwise, consider rest, hydration, and monitoring "
            "your symptoms, and consult a licensed medical professional for proper evaluation."
        ),
        "disclaimer": (
            f"Educational use only. Not a diagnosis. ({reason}) "
            "Always consult a qualified medical professional."
        ),
    }


def _gemini_generate_url(model: str | None = None, base_url: str | None = None) -> str:
    # Re-read from env to support local .env edits without a restart.
    base = (base_url or _env_str("GEMINI_API_BASE_URL", GEMINI_API_BASE_URL) or GEMINI_API_BASE_URL).rstrip("/")
    effective_model = (model or _env_str("GEMINI_MODEL", GEMINI_MODEL) or GEMINI_MODEL).strip()
    api_key = _env_str("GEMINI_API_KEY", "") or ""
    path = f"/models/{effective_model}:generateContent"
    return f"{base}{path}?{urlencode({'key': api_key})}"


def _post_gemini(payload: dict, model: str | None = None, base_url: str | None = None) -> requests.Response:
    return requests.post(
        _gemini_generate_url(model=model, base_url=base_url),
        headers={"Content-Type": "application/json"},
        json=payload,
        timeout=30,
    )


def _post_gemini_with_retries(
    payload: dict,
    model: str | None = None,
    base_url: str | None = None,
) -> requests.Response:
    """Retry a few times on transient provider errors (e.g., 429/5xx)."""

    # Keep total retry delay small so the frontend doesn't time out.
    backoffs = (0.6, 1.2)
    response = _post_gemini(payload, model=model, base_url=base_url)

    for delay in backoffs:
        if response.status_code in (429, 500, 502, 503, 504):
            time.sleep(delay)
            response = _post_gemini(payload, model=model, base_url=base_url)
        else:
            break

    return response


def _unique_nonempty_strings(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        cleaned = (value or "").strip()
        if cleaned and cleaned not in seen:
            seen.add(cleaned)
            result.append(cleaned)
    return result


def _post_gemini_try_models(payload: dict, models: list[str]) -> tuple[requests.Response, str]:
    """Try multiple model IDs when the provider returns 404 (model not found).

    Returns the first non-404 response, or the last response if all attempts 404.
    """

    model_candidates = _unique_nonempty_strings(models)
    if not model_candidates:
        response = _post_gemini_with_retries(payload)
        return response, GEMINI_MODEL

    last_response: requests.Response | None = None
    last_model: str = model_candidates[0]

    for model in model_candidates:
        last_model = model
        response = _post_gemini_with_retries(payload, model=model)
        last_response = response
        if response.status_code != 404:
            return response, model

    # All attempts were 404
    assert last_response is not None
    return last_response, last_model


def _post_gemini_try_targets(payload: dict, models: list[str], base_urls: list[str]) -> tuple[requests.Response, str, str]:
    """Try combinations of base URLs and model IDs to avoid 404s.

    Some environments have model IDs available only under a specific API version
    (e.g., v1 vs v1beta). This method tries a small set of candidates.
    """

    base_candidates = _unique_nonempty_strings(base_urls)
    if not base_candidates:
        base_candidates = [GEMINI_API_BASE_URL]

    last_response: requests.Response | None = None
    last_model = GEMINI_MODEL
    last_base = GEMINI_API_BASE_URL

    for base in base_candidates:
        response, model_used = _post_gemini_try_models_with_base(payload, models=models, base_url=base)
        last_response = response
        last_model = model_used
        last_base = base
        if response.status_code != 404:
            return response, model_used, base

    assert last_response is not None
    return last_response, last_model, last_base


def _post_gemini_try_models_with_base(payload: dict, models: list[str], base_url: str) -> tuple[requests.Response, str]:
    model_candidates = _unique_nonempty_strings(models)
    if not model_candidates:
        response = _post_gemini_with_retries(payload, base_url=base_url)
        return response, GEMINI_MODEL

    last_response: requests.Response | None = None
    last_model: str = model_candidates[0]

    for model in model_candidates:
        last_model = model
        response = _post_gemini_with_retries(payload, model=model, base_url=base_url)
        last_response = response
        if response.status_code != 404:
            return response, model

    assert last_response is not None
    return last_response, last_model


def _extract_gemini_text(response_json: dict) -> str:
    candidates = response_json.get("candidates") or []
    if not candidates:
        raise ValueError("Gemini returned no candidates")
    content = (candidates[0] or {}).get("content") or {}
    parts = content.get("parts") or []
    text_parts = []
    for part in parts:
        if isinstance(part, dict) and isinstance(part.get("text"), str):
            text_parts.append(part["text"])
    if not text_parts:
        raise ValueError("Gemini candidate contained no text")
    return "\n".join(text_parts)


@app.route("/")
def home():
    return jsonify(
        {
            "status": "running",
            "message": "Symptom Checker backend with LLM-Powered AI is running! ✅",
            "endpoints": {
                "analyze": "POST /analyze - Analyze symptoms using AI",
            },
        }
    )


@app.route("/analyze", methods=["POST"])
def analyze_symptoms():
    try:
        # Reload local backend env on each request so edits to healthcare-backend/.env
        # are picked up without requiring a manual restart.
        load_dotenv(BASE_DIR / ".env", override=True)

        # Use silent=True so malformed JSON or missing content-type returns None
        # instead of raising a BadRequest exception.
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            return jsonify({"error": "Invalid or missing JSON body"}), 400

        symptoms_value = data.get("symptoms", "")
        symptoms = symptoms_value.strip() if isinstance(symptoms_value, str) else ""
        if not symptoms:
            return jsonify({"error": "No symptoms provided"}), 400

        seeded = _try_get_seeded_result(symptoms)
        if seeded is not None:
            return jsonify(seeded)

        hf_key = _env_str("HF_API_KEY")
        hf_model = _env_str("HF_MODEL_NAME")

        # Prefer Hugging Face when configured.
        if hf_key and hf_model:
            temperature = max(0.0, min(_env_float("HF_TEMPERATURE", 0.2), 2.0))
            max_tokens = max(1, min(_env_int("HF_MAX_TOKENS", 512), 2048))
            timeout_ms = max(3000, min(_env_int("ANALYZE_TIMEOUT_MS", 30000), 60000))
            timeout_s = timeout_ms / 1000.0
            hf_base_url = _env_str("HF_BASE_URL", HF_ROUTER_BASE_URL) or HF_ROUTER_BASE_URL

            prompt = f"""Analyze these symptoms for educational purposes only: \"{symptoms}\"\n\nProvide a structured response with:\n1. 2-3 possible conditions (common, non-emergency)\n2. Recommended next steps (general advice)\n3. Important disclaimer about consulting medical professionals\n\nFormat the response as valid JSON with these exact keys:\n- \"conditions\" (array of strings)\n- \"recommendations\" (string)\n- \"disclaimer\" (string)\n\nKeep it educational, non-alarming, and emphasize this is not medical diagnosis.\n\nReturn ONLY valid JSON, no other text or markdown."""

            hf_payload = {
                "model": hf_model,
                "messages": [
                    {
                        "role": "user",
                        "content": (
                            "You are an empathetic medical information assistant. "
                            "Provide educational, non-emergency guidance only and remind users to consult licensed clinicians.\n\n"
                            + prompt
                        ),
                    }
                ],
                "temperature": temperature,
                "max_tokens": max_tokens,
                "stream": False,
            }

            t0 = time.time()
            try:
                resp = _post_hf_with_resilience(hf_payload, base_url=hf_base_url, api_key=hf_key, timeout_s=timeout_s)
            except PermissionError as exc:
                return (
                    jsonify(
                        {
                            "error": "LLM provider authentication failed. Backend is not configured correctly.",
                            "code": "LLM_AUTH_ERROR",
                            "llm_status": 401,
                            "llm_message": str(exc),
                            "conditions": [],
                            "recommendations": "Verify HF_API_KEY and HF_MODEL_NAME are set and the token can access the model.",
                            "disclaimer": "Please contact the administrator",
                        }
                    ),
                    500,
                )

            latency_ms = int((time.time() - t0) * 1000)
            print(f"[hf] /analyze model={hf_model} status={resp.status_code} latency={latency_ms}ms")

            if resp.status_code == 200:
                response_json = resp.json()
                hf_text = _extract_hf_text(response_json)
                try:
                    result = _parse_llm_json_output(hf_text)
                except Exception:
                    result = {
                        "conditions": ["Consult a medical professional"],
                        "recommendations": "Based on your symptoms, consult a doctor for proper medical advice.",
                        "disclaimer": "Educational purposes only - not medical advice",
                    }
                return jsonify(result)

            # Provider-side errors mapped to stable responses.
            if resp.status_code == 429:
                if RETURN_FALLBACK_ON_LLM_ERROR:
                    return jsonify(_fallback_result("AI provider rate limit")), 503
                return (
                    jsonify(
                        {
                            "error": "LLM provider rate limit. Please try again later.",
                            "code": "LLM_RATE_LIMIT",
                            "llm_status": 429,
                            "conditions": [],
                            "recommendations": "Try again in a few minutes.",
                            "disclaimer": "Please try again later",
                        }
                    ),
                    503,
                )

            if resp.status_code in (401, 403):
                return (
                    jsonify(
                        {
                            "error": "LLM provider authentication failed. Backend is not configured correctly.",
                            "code": "LLM_AUTH_ERROR",
                            "llm_status": resp.status_code,
                            "conditions": [],
                            "recommendations": "Verify HF_API_KEY is correct and the token can access HF_MODEL_NAME.",
                            "disclaimer": "Please contact the administrator",
                        }
                    ),
                    500,
                )

            if RETURN_FALLBACK_ON_LLM_ERROR:
                return jsonify(_fallback_result(f"AI provider error {resp.status_code}")), 503

            return (
                jsonify(
                    {
                        "error": "LLM service error",
                        "code": "LLM_ERROR",
                        "llm_status": resp.status_code,
                        "conditions": [],
                        "recommendations": "AI service temporarily unavailable",
                        "disclaimer": "Please try again later",
                    }
                ),
                503,
            )

        # If HF is not configured, fall back to Gemini (legacy).
        gemini_key = _env_str("GEMINI_API_KEY")
        if not gemini_key:
            if RETURN_FALLBACK_ON_LLM_ERROR:
                return jsonify(_fallback_result("AI provider not configured (missing HF_API_KEY/HF_MODEL_NAME)")), 500

            return (
                jsonify(
                    {
                        "error": "LLM provider not configured",
                        "code": "LLM_NOT_CONFIGURED",
                        "conditions": [],
                        "recommendations": "Service configuration error",
                        "disclaimer": "Please contact administrator",
                    }
                ),
                500,
            )

        prompt = f"""Analyze these symptoms for educational purposes only: "{symptoms}"

Provide a structured response with:
1. 2-3 possible conditions (common, non-emergency)
2. Recommended next steps (general advice)
3. Important disclaimer about consulting medical professionals

Format the response as valid JSON with these exact keys:
- "conditions" (array of strings)
- "recommendations" (string)
- "disclaimer" (string)

Keep it educational, non-alarming, and emphasize this is not medical diagnosis.

Return ONLY valid JSON, no other text or markdown."""

        payload = {
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        {
                            "text": (
                                "You are an empathetic medical information assistant. "
                                "Provide educational, non-emergency guidance only and remind users to consult licensed clinicians.\n\n"
                                + prompt
                            )
                        }
                    ],
                }
            ],
            "generationConfig": {
                "temperature": 0.7,
                "maxOutputTokens": 500,
            },
        }

        # Some deployments end up with a model ID or API version that Gemini doesn't recognize (404).
        # Try a couple of common alternatives (models + v1/v1beta) before giving up.
        response, _model_used, _base_used = _post_gemini_try_targets(
            payload,
            models=[
                GEMINI_MODEL,
                "gemini-1.5-flash",
                "gemini-1.5-flash-latest",
                "gemini-2.0-flash",
            ],
            base_urls=[
                GEMINI_API_BASE_URL,
                "https://generativelanguage.googleapis.com/v1",
                "https://generativelanguage.googleapis.com/v1beta",
            ],
        )

        if response.status_code == 200:
            ai_response = response.json()
            ai_content = _extract_gemini_text(ai_response)

            try:
                cleaned_content = ai_content.strip()
                if "```json" in cleaned_content:
                    json_str = cleaned_content.split("```json")[1].split("```")[0].strip()
                    result = json.loads(json_str)
                elif "```" in cleaned_content:
                    json_str = cleaned_content.split("```")[1].split("```")[0].strip()
                    result = json.loads(json_str)
                else:
                    result = json.loads(cleaned_content)
            except json.JSONDecodeError:
                result = {
                    "conditions": ["Consult a medical professional"],
                    "recommendations": "Based on your symptoms, consult a doctor for proper medical advice.",
                    "disclaimer": "Educational purposes only - not medical advice",
                }

            return jsonify(result)

        # Bubble up common provider-side errors with a friendlier, stable shape.
        provider_message = None
        provider_status = None
        try:
            provider_payload = response.json()
            provider_error = provider_payload.get("error") or {}
            provider_message = provider_error.get("message")
            provider_status = provider_error.get("status")
        except Exception:  # noqa: BLE001
            provider_payload = None

        if response.status_code == 429:
            if RETURN_FALLBACK_ON_LLM_ERROR:
                return jsonify(_fallback_result("AI provider rate limit or quota exceeded")), 503

            return (
                jsonify(
                    {
                        "error": "LLM provider rate limit or quota exceeded. Please try again later.",
                        "code": "LLM_RATE_LIMIT",
                        "llm_status": response.status_code,
                        "llm_provider_status": provider_status,
                        "llm_message": provider_message,
                        "conditions": [],
                        "recommendations": "Try again in a few minutes. If the issue persists, check your Google AI/Gemini billing and quota limits.",
                        "disclaimer": "Please try again later",
                    }
                ),
                503,
            )

        if response.status_code in (401, 403):
            return (
                jsonify(
                    {
                        "error": "LLM provider authentication failed. Backend is not configured correctly.",
                        "code": "LLM_AUTH_ERROR",
                        "llm_status": response.status_code,
                        "llm_provider_status": provider_status,
                        "llm_message": provider_message,
                        "conditions": [],
                        "recommendations": "Verify GEMINI_API_KEY is set correctly in the backend environment.",
                        "disclaimer": "Please contact the administrator",
                    }
                ),
                500,
            )

        if RETURN_FALLBACK_ON_LLM_ERROR:
            return jsonify(_fallback_result(f"AI provider error {response.status_code}")), 503

        return (
            jsonify(
                {
                    "error": "LLM service error",
                    "code": "LLM_ERROR",
                    "llm_status": response.status_code,
                    "llm_provider_status": provider_status,
                    "llm_message": provider_message,
                    "conditions": [],
                    "recommendations": "AI service temporarily unavailable",
                    "disclaimer": "Please try again later",
                }
            ),
            503,
        )

    except Exception as exc:  # pylint: disable=broad-except
        return (
            jsonify(
                {
                    "error": f"Analysis failed: {exc}",
                    "conditions": [],
                    "recommendations": "Please try again later",
                    "disclaimer": "Service temporarily unavailable",
                }
            ),
            500,
        )


def main():
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port)


if __name__ == "__main__":
    main()
