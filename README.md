Healthcare Symptom Checker
================================================

- Demo Video Link - [https://drive.google.com/file/d/1MQCe32v8qqew1ZcJ2wRegZezT9dL4K2r/view?usp=sharing](https://drive.google.com/file/d/1MQCe32v8qqew1ZcJ2wRegZezT9dL4K2r/view?usp=sharing)
- **Application:** [https://healthcare-symptom-checker-sooty.vercel.app/](https://healthcare-symptom-checker-sooty.vercel.app/)
- **Backend (Render - may be inactive due to sleep mode):** [https://healthcare-symptom-checker-backend-xktt.onrender.com](https://healthcare-symptom-checker-backend-xktt.onrender.com)
- A modern web application that helps users understand potential conditions and general recommendations based on described symptoms. The system consists of a Next.js frontend and a Python (Flask) backend that integrates with Google Gemini for AI-powered analysis. This tool is intended for educational use only and is not a substitute for professional medical advice.


Overview
------------------------------------------------
- Frontend: Next.js 15 (React 19, TypeScript, Tailwind CSS)
- Backend: Python Flask with CORS
- AI Model: Google Gemini 2.0 Flash (via Generative Language API)
- Deployment Targets: Vercel (frontend) and Render (backend)


Monorepo Layout
------------------------------------------------

```
.
├─ app/                         # Next.js App Router frontend
│  ├─ page.tsx
│  ├─ layout.tsx
│  └─ api/analyze/route.ts      # Frontend API route proxy to backend
├─ components/                  # UI components
├─ public/                      # Static assets
├─ styles/                      # Global styles
├─ app.py                       # Flask backend (also duplicated under healthcare-backend/)
├─ requirements.txt             # Backend Python dependencies
├─ runtime.txt                  # Backend runtime (Render)
├─ package.json                 # Frontend dependencies and scripts
├─ pnpm-lock.yaml
├─ next.config.mjs
├─ tsconfig.json
└─ README.md
```


Prerequisites
------------------------------------------------
- Node.js 18 or newer
- pnpm (recommended) or npm/yarn
- Python 3.10+ (for local backend runs)


Environment Variables
------------------------------------------------

Frontend (Next.js):
- NEXT_PUBLIC_BACKEND_URL: Full URL to the backend analyze endpoint. Example:
  - `https://healthcare-symptom-checker-backend-xktt.onrender.com/analyze`

Backend (Flask):
- GEMINI_API_KEY: Google Generative Language API key.


Local Development
------------------------------------------------

1) Clone repository
```
git clone https://github.com/Aviijeet12/healthcare-symptom-checker.git
cd healthcare-symptom-checker
```

2) Configure frontend environment
Create a file named `.env.local` in the repository root:
```
NEXT_PUBLIC_BACKEND_URL=https://healthcare-symptom-checker-backend-xktt.onrender.com/analyze
```

3) Install frontend dependencies and start dev server
```
pnpm install
pnpm dev
# App will be available at http://localhost:3000
```

4) Optional: Run backend locally (if you want to test without Render)
```
pip install -r requirements.txt
set FLASK_APP=app.py
set GEMINI_API_KEY=your_api_key_here
python app.py
# Backend runs on http://localhost:10000 by default
```
If you run the backend locally, update `NEXT_PUBLIC_BACKEND_URL` accordingly, e.g., `http://localhost:10000/analyze`.


Frontend to Backend Flow
------------------------------------------------
- The Next.js route `app/api/analyze/route.ts` posts JSON to `NEXT_PUBLIC_BACKEND_URL`.
- The backend endpoint `/analyze` calls Google Gemini and returns a structured JSON response.


API Reference (Backend)
------------------------------------------------
Endpoint:
```
POST /analyze
Content-Type: application/json
```

Request body:
```
{
  "symptoms": "free-form text describing symptoms"
}
```

Successful response body (example):
```
{
  "conditions": ["Seasonal allergies", "Common cold"],
  "recommendations": "Stay hydrated, consider over-the-counter antihistamines, and consult a clinician if symptoms persist.",
  "disclaimer": "Educational purposes only. Not medical advice. Consult a qualified professional."
}
```

Error responses:
- 400: Missing or invalid input
- 500/503/504: Upstream or service error, includes an `error` description and optional `code`/`details`.


Deployment
------------------------------------------------

Backend (Render):
- Root contains `app.py`, `requirements.txt`, and `runtime.txt`.
- Add environment variable `GEMINI_API_KEY` in Render dashboard.
- Deploy the service; verify health at `/` and the main endpoint at `/analyze`.

Frontend (Vercel):
- Import the GitHub repository in Vercel.
- Add environment variable `NEXT_PUBLIC_BACKEND_URL` with the full Render URL ending in `/analyze`.
- Use default build settings for Next.js 15 (no custom commands needed).
- Trigger deployment and verify the app.


Troubleshooting
------------------------------------------------
- 404 model not found from Gemini: Ensure the model path is `models/gemini-2.0-flash:generateContent`.
- 500 from backend: Confirm `GEMINI_API_KEY` is set in Render and not rate-limited; check Render logs.
- Request timeout from frontend: Backend free tier can be slow. Try again or increase timeout if self-hosted.
- Mixed environments: Confirm `NEXT_PUBLIC_BACKEND_URL` matches the backend environment you intend to use.


Security & Privacy
------------------------------------------------
- The application does not persist user inputs.
- Do not log sensitive medical information in production logs.
- Treat API keys as secrets; never commit them to source control.


Disclaimer
------------------------------------------------
This application is provided for educational purposes only and does not constitute medical advice, diagnosis, or treatment. Always consult a qualified healthcare professional for medical concerns or emergencies.


License
------------------------------------------------
This project is open source and available under the MIT License.
