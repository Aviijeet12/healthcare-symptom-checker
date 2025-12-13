"""Simple helper script to validate OpenAI connectivity locally.

Set OPENAI_API_KEY (and optionally OPENAI_MODEL/OPENAI_API_URL) before running:

    set OPENAI_API_KEY=sk-...
    python test_openai_api.py
"""

import json
import os
import requests

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
OPENAI_API_URL = os.getenv("OPENAI_API_URL", "https://api.openai.com/v1/chat/completions")

if not OPENAI_API_KEY:
    raise RuntimeError("OPENAI_API_KEY environment variable is missing.")

prompt = "Analyze these symptoms for educational purposes only: 'headache and fever'. Return valid JSON with keys: conditions, recommendations, disclaimer."

payload = {
    "model": OPENAI_MODEL,
    "temperature": 0.7,
    "max_tokens": 300,
    "messages": [
        {
            "role": "system",
            "content": "You are an empathetic medical information assistant. Respond with valid JSON only."
        },
        {"role": "user", "content": prompt},
    ],
}

response = requests.post(
    OPENAI_API_URL,
    headers={
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json",
    },
    json=payload,
    timeout=30,
)

print("Status Code:", response.status_code)
try:
    data = response.json()
    print("Response:", json.dumps(data, indent=2))
except Exception as exc:
    print("Error parsing response:", exc)
    print("Raw Response:", response.text)
