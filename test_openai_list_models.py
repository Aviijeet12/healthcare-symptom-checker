"""Utility script to list available OpenAI models for the configured API key.

Usage:
    set OPENAI_API_KEY=sk-...
    python test_openai_list_models.py
"""

import os
import requests

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_API_URL = os.getenv("OPENAI_MODELS_URL", "https://api.openai.com/v1/models")

if not OPENAI_API_KEY:
    raise RuntimeError("OPENAI_API_KEY environment variable is missing.")

response = requests.get(
    OPENAI_API_URL,
    headers={
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json",
    },
    timeout=30,
)

print("Status Code:", response.status_code)
print("Response:", response.text)
