from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import requests
import json

app = Flask(__name__)
CORS(app)

# Gemini API configuration
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"

@app.route('/')
def home():
    return jsonify({
        "status": "running", 
        "message": "Healthcare Symptom Checker Backend with Gemini AI is running! ✅",
        "endpoints": {
            "analyze": "POST /analyze - Analyze symptoms using AI"
        }
    })

@app.route('/analyze', methods=['POST'])
def analyze_symptoms():
    try:
        # Get JSON data
        data = request.get_json()
        
        if not data:
            return jsonify({"error": "No JSON data received"}), 400
            
        symptoms = data.get('symptoms', '').strip()
        
        if not symptoms:
            return jsonify({"error": "No symptoms provided"}), 400

        # Check if Gemini API key is set
        if not GEMINI_API_KEY:
            return jsonify({
                "error": "Gemini API key not configured",
                "conditions": [],
                "recommendations": "Service configuration error",
                "disclaimer": "Please contact administrator"
            }), 500

        # Gemini API call
        prompt = f"""Analyze these symptoms for educational purposes only: "{symptoms}"

Provide a structured response with:
1. 2-3 possible conditions (common, non-emergency)
2. Recommended next steps (general advice) 
3. Important disclaimer about consulting healthcare professionals

Format the response as valid JSON with these exact keys:
- "conditions" (array of strings)
- "recommendations" (string)
- "disclaimer" (string)

Keep it educational, non-alarming, and emphasize this is not medical diagnosis.

Return ONLY valid JSON, no other text or markdown."""

        payload = {
            "contents": [{
                "parts": [{
                    "text": prompt
                }]
            }],
            "generationConfig": {
                "temperature": 0.7,
                "maxOutputTokens": 500
            }
        }

        # Make request to Gemini API
        response = requests.post(
            f"{GEMINI_API_URL}?key={GEMINI_API_KEY}",
            headers={'Content-Type': 'application/json'},
            json=payload,
            timeout=30
        )

        if response.status_code == 200:
            ai_response = response.json()
            ai_content = ai_response['candidates'][0]['content']['parts'][0]['text']
            
            # Parse the JSON response
            try:
                # Clean the response
                cleaned_content = ai_content.strip()
                
                # Remove markdown code blocks if present
                if '```json' in cleaned_content:
                    json_str = cleaned_content.split('```json')[1].split('```')[0].strip()
                    result = json.loads(json_str)
                elif '```' in cleaned_content:
                    json_str = cleaned_content.split('```')[1].split('```')[0].strip()
                    result = json.loads(json_str)
                else:
                    result = json.loads(cleaned_content)
                    
            except json.JSONDecodeError:
                # If JSON parsing fails, use fallback
                result = {
                    "conditions": ["Consult healthcare professional"],
                    "recommendations": "Based on your symptoms, consult a doctor for proper medical advice.",
                    "disclaimer": "Educational purposes only - not medical advice"
                }
            
            return jsonify(result)
            
        else:
            return jsonify({
                "error": f"Gemini API error: {response.status_code}",
                "conditions": [],
                "recommendations": "AI service temporarily unavailable",
                "disclaimer": "Please try again later"
            }), 500

    except Exception as e:
        return jsonify({
            "error": f"Analysis failed: {str(e)}",
            "conditions": [],
            "recommendations": "Please try again later", 
            "disclaimer": "Service temporarily unavailable"
        }), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 10000))
    app.run(host='0.0.0.0', port=port)