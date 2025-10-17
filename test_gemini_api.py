import requests
import os
import json

GEMINI_API_KEY = "AIzaSyAtj0bMirDSOlfARDdhLiFcB8T5jK9XtTM"  # Your key
GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"

prompt = "Analyze these symptoms for educational purposes only: 'headache and fever'. Return valid JSON with keys: conditions, recommendations, disclaimer."

payload = {
    "contents": [{
        "parts": [{"text": prompt}]
    }],
    "generationConfig": {
        "temperature": 0.7,
        "maxOutputTokens": 500
    }
}

response = requests.post(
    f"{GEMINI_API_URL}?key={GEMINI_API_KEY}",
    headers={"Content-Type": "application/json"},
    json=payload,
    timeout=30
)

print("Status Code:", response.status_code)
try:
    print("Response:", response.json())
except Exception as e:
    print("Error parsing response:", e)
    print("Raw Response:", response.text)
