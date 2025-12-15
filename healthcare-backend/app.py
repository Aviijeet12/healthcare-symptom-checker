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

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS

# Load environment variables from .env inside healthcare-backend (optional for local dev)
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

app = Flask(__name__)
CORS(app)

# Gemini API configuration
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
GEMINI_API_BASE_URL = os.getenv("GEMINI_API_BASE_URL", "https://generativelanguage.googleapis.com/v1beta")

# When enabled, the backend will return a safe, educational fallback response when
# the LLM provider is unavailable/rate-limited, instead of failing the request.
RETURN_FALLBACK_ON_LLM_ERROR = os.getenv("RETURN_FALLBACK_ON_LLM_ERROR", "1").lower() in {
    "1",
    "true",
    "yes",
    "y",
    "on",
}


def _fallback_result(reason: str) -> dict:
    return {
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


def _gemini_generate_url() -> str:
    base = GEMINI_API_BASE_URL.rstrip("/")
    path = f"/models/{GEMINI_MODEL}:generateContent"
    return f"{base}{path}?{urlencode({'key': GEMINI_API_KEY or ''})}"


def _post_gemini(payload: dict) -> requests.Response:
    return requests.post(
        _gemini_generate_url(),
        headers={"Content-Type": "application/json"},
        json=payload,
        timeout=30,
    )


def _post_gemini_with_retries(payload: dict) -> requests.Response:
    """Retry a few times on transient provider errors (e.g., 429/5xx)."""

    # Keep total retry delay small so the frontend doesn't time out.
    backoffs = (0.6, 1.2)
    response = _post_gemini(payload)

    for delay in backoffs:
        if response.status_code in (429, 500, 502, 503, 504):
            time.sleep(delay)
            response = _post_gemini(payload)
        else:
            break

    return response


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
        # Use silent=True so malformed JSON or missing content-type returns None
        # instead of raising a BadRequest exception.
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            return jsonify({"error": "Invalid or missing JSON body"}), 400

        symptoms_value = data.get("symptoms", "")
        symptoms = symptoms_value.strip() if isinstance(symptoms_value, str) else ""
        if not symptoms:
            return jsonify({"error": "No symptoms provided"}), 400

        if not GEMINI_API_KEY:
            return (
                jsonify(
                    {
                        "error": "Gemini API key not configured",
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

        response = _post_gemini_with_retries(payload)

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
                return jsonify(_fallback_result("AI provider rate limit or quota exceeded"))

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
            return jsonify(_fallback_result(f"AI provider error {response.status_code}"))

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
