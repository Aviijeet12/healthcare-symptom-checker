
import requests

GEMINI_API_KEY = "AIzaSyAtj0bMirDSOlfARDdhLiFcB8T5jK9XtTM"
url = f"https://generativelanguage.googleapis.com/v1beta/models?key={GEMINI_API_KEY}"
resp = requests.get(url)
print(resp.status_code)
print(resp.text)
