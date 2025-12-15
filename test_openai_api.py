"""Simple helper script to validate Gemini connectivity locally.

Set GEMINI_API_KEY (and optionally GEMINI_MODEL/GEMINI_API_BASE_URL) before running:

    set GEMINI_API_KEY=...
    python test_openai_api.py
"""

import json
import os
from urllib.parse import urlencode

import requests

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
GEMINI_API_BASE_URL = os.getenv("GEMINI_API_BASE_URL", "https://generativelanguage.googleapis.com/v1beta")

if not GEMINI_API_KEY:
    raise RuntimeError("GEMINI_API_KEY environment variable is missing.")

prompt = "Analyze these symptoms for educational purposes only: 'headache and fever'. Return valid JSON with keys: conditions, recommendations, disclaimer."

url = (
    f"{GEMINI_API_BASE_URL.rstrip('/')}"
    f"/models/{GEMINI_MODEL}:generateContent?{urlencode({'key': GEMINI_API_KEY})}"
)

payload = {
    "contents": [
        {
            "role": "user",
            "parts": [
                {
                    "text": (
                        "You are an empathetic medical information assistant. Respond with valid JSON only.\n\n"
                        + prompt
                    )
                }
            ],
        }
    ],
    "generationConfig": {"temperature": 0.7, "maxOutputTokens": 300},
}

response = requests.post(url, headers={"Content-Type": "application/json"}, json=payload, timeout=30)

print("Status Code:", response.status_code)
try:
    data = response.json()
    print("Response:", json.dumps(data, indent=2))
except Exception as exc:
    print("Error parsing response:", exc)
    print("Raw Response:", response.text)
