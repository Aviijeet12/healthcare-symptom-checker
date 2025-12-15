"""Flask backend for the Symptom Checker application.

This module lives inside the healthcare-backend/ directory so that the Render
service can target this folder as its root, keeping API credentials isolated
from the frontend.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS

# Load environment variables from .env inside healthcare-backend (optional for local dev)
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

app = Flask(__name__)
CORS(app)

# OpenAI API configuration
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
OPENAI_API_URL = os.getenv("OPENAI_API_URL", "https://api.openai.com/v1/chat/completions")


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

        if not OPENAI_API_KEY:
            return (
                jsonify(
                    {
                        "error": "OpenAI API key not configured",
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
            "model": OPENAI_MODEL,
            "temperature": 0.7,
            "max_tokens": 500,
            "messages": [
                {
                    "role": "system",
                    "content": "You are an empathetic medical information assistant. Provide educational, non-emergency guidance only and remind users to consult licensed clinicians.",
                },
                {"role": "user", "content": prompt},
            ],
        }

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {OPENAI_API_KEY}",
        }

        response = requests.post(OPENAI_API_URL, headers=headers, json=payload, timeout=30)

        if response.status_code == 200:
            ai_response = response.json()
            ai_content = ai_response["choices"][0]["message"]["content"]

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
        try:
            provider_payload = response.json()
            provider_message = (
                provider_payload.get("error", {}) or {}
            ).get("message")
        except Exception:  # noqa: BLE001
            provider_payload = None

        if response.status_code == 429:
            return (
                jsonify(
                    {
                        "error": "LLM provider rate limit or quota exceeded. Please try again later.",
                        "code": "LLM_RATE_LIMIT",
                        "llm_status": response.status_code,
                        "llm_message": provider_message,
                        "conditions": [],
                        "recommendations": "Try again in a few minutes. If the issue persists, check your OpenAI billing/usage limits.",
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
                        "conditions": [],
                        "recommendations": "Verify OPENAI_API_KEY is set correctly in the backend environment.",
                        "disclaimer": "Please contact the administrator",
                    }
                ),
                500,
            )

        return (
            jsonify(
                {
                    "error": "LLM service error",
                    "code": "LLM_ERROR",
                    "llm_status": response.status_code,
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
