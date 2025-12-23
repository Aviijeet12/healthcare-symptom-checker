Symptom Checker
================================================

- **Application:** [https://healthcare-symptom-checker-sooty.vercel.app/](https://healthcare-symptom-checker-sooty.vercel.app/)
- **Backend (Render - may be inactive due to sleep mode):** [https://healthcare-symptom-checker-backend-xktt.onrender.com](https://healthcare-symptom-checker-backend-xktt.onrender.com)
- A modern web application that helps users understand potential conditions and general recommendations based on described symptoms. The system consists of a Next.js frontend and a Python (Flask) backend that integrates with a Gemini LLM for analysis. This tool is intended for educational use only and is not a substitute for professional medical advice.


Overview
------------------------------------------------
- Frontend: Next.js 15 (React 19, TypeScript, Tailwind CSS)
- Backend: Python Flask with CORS
- AI Model: Google Gemini (configurable via environment variable)
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
├─ healthcare-backend/          # Flask + Gemini backend deployed to Render
│  ├─ app.py
│  ├─ requirements.txt
│  └─ runtime.txt
├─ app.py                       # Thin shim that re-exports healthcare-backend/app.py
├─ requirements.txt             # Legacy root-level deps (frontend tooling)
├─ runtime.txt                  # Legacy root-level runtime (unused now)
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

- NEXT_PUBLIC_BACKEND_URL: Full URL to the backend analyze endpoint. Example:
  - `https://healthcare-symptom-checker-backend-xktt.onrender.com/analyze`

Backend (Flask):
- GEMINI_API_KEY: Gemini API key.
- GEMINI_MODEL (optional): Override the default `gemini-1.5-flash` model name.
- Place these in `healthcare-backend/.env` for local development (automatically loaded via `python-dotenv`).

Environment templates are provided:
- Copy `.env.example` → `.env.local` for the frontend.
- Copy `healthcare-backend/.env.example` → `healthcare-backend/.env` for the backend.


Local Development
------------------------------------------------

1) Clone repository
```
git clone https://github.com/Aviijeet12/healthcare-symptom-checker.git
cd healthcare-symptom-checker
```

2) Configure frontend environment
```
copy .env.example .env.local       # Windows
# or
cp .env.example .env.local         # macOS/Linux
```
Edit `.env.local` so `NEXT_PUBLIC_BACKEND_URL` points to either Render or your local backend (`http://localhost:10000/analyze`).

3) Configure backend environment
```
copy healthcare-backend\.env.example healthcare-backend\.env
# or
cp healthcare-backend/.env.example healthcare-backend/.env
```
Set `GEMINI_API_KEY` (and optional overrides) inside `healthcare-backend/.env`.

4) Install frontend dependencies
```
pnpm install
```

5) Install backend dependencies (via helper script)
```
pnpm backend:install
```

6) Start the backend locally (new terminal)
```
pnpm backend:dev
# Backend listens on http://localhost:10000 by default
```

7) Start the frontend dev server (another terminal)
```
pnpm dev
# App will be available at http://localhost:3000
```


Frontend to Backend Flow
------------------------------------------------
- The Next.js route `app/api/analyze/route.ts` posts JSON to `NEXT_PUBLIC_BACKEND_URL`.
- The backend endpoint `/analyze` (hosted under `healthcare-backend/`) calls the configured Gemini model and returns a structured JSON response.


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
- Set **Root Directory** to `healthcare-backend`.
- Build Command: `pip install -r requirements.txt`
- Start Command: `python app.py`
- Add environment variable `GEMINI_API_KEY` in the Render dashboard (and optional `GEMINI_MODEL`).
- Deploy the service; verify health at `/` and the main endpoint at `/analyze`.

Frontend (Vercel):
- Import the GitHub repository in Vercel.
- Add environment variable `NEXT_PUBLIC_BACKEND_URL` with the full Render URL ending in `/analyze`.
- Use default build settings for Next.js 15 (no custom commands needed).
- Trigger deployment and verify the app.


Automation & Tests
------------------------------------------------
- `pnpm test:backend`: Runs the lightweight Flask smoke test (`healthcare-backend/tests/smoke_test.py`).
- `pnpm check:all`: Runs ESLint and the backend smoke test in sequence.
- `pnpm backend:install` / `pnpm backend:dev`: Helper scripts for managing the Python backend from the root workspace.

See [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) for an end-to-end sequence covering env setup, automated checks, and deployment verification.


Troubleshooting
------------------------------------------------
- 404/429 errors from Gemini: Ensure the model name is correct (default `gemini-1.5-flash`) and that your key has sufficient quota.
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
