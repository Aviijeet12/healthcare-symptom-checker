Symptom Checker
================================================

- **Application:** [https://healthcare-symptom-checker-sooty.vercel.app/](https://healthcare-symptom-checker-sooty.vercel.app/)
- **Backend (Render - may be inactive due to sleep mode):** [https://healthcare-symptom-checker-backend-xktt.onrender.com](https://healthcare-symptom-checker-backend-xktt.onrender.com)
- A modern web application that helps users understand potential conditions and general recommendations based on described symptoms. The system consists of a Next.js app with a backend API route that calls the Hugging Face Inference API for analysis. This tool is intended for educational use only and is not a substitute for professional medical advice.


Overview
------------------------------------------------
- Frontend: Next.js 15 (React 19, TypeScript, Tailwind CSS)
- Backend: Next.js API route (Node.js runtime)
- AI Model: Hugging Face Inference API (configurable via environment variable)
- Deployment Targets: Vercel (single app) or any Node-compatible host


Monorepo Layout
------------------------------------------------

```
.
├─ app/                         # Next.js App Router frontend
│  ├─ page.tsx
│  ├─ layout.tsx
│  └─ api/analyze/route.ts      # Backend API route (calls Hugging Face)
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


Environment Variables
------------------------------------------------

Backend (Next.js API route):
- HF_API_KEY: Hugging Face API key (required).
- HF_MODEL_NAME: Hugging Face model name (required), e.g. `meta-llama/Llama-3.1-8B-Instruct`.
- HF_TEMPERATURE (optional): generation temperature.
- HF_MAX_TOKENS (optional): max new tokens.
- ANALYZE_TIMEOUT_MS (optional): request timeout (ms).

Optional caching (recommended for lower latency / reduced HF calls):
- REDIS_URL: Redis connection URL (enables caching when set).
- ANALYZE_CACHE_TTL_SECONDS (optional): cache TTL in seconds (default 86400).
- ANALYZE_CACHE_ENABLED (optional): set to 0/false to disable caching.

Vercel + AWS Lambda (recommended deployment):
- ANALYZE_API_URL: API Gateway invoke URL for your Lambda (when set, Vercel `/api/analyze` proxies requests to AWS).

Environment templates are provided:
- Copy `.env.example` → `.env.local` for the frontend.


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
Edit `.env.local` and set `HF_API_KEY` and `HF_MODEL_NAME`.

3) Install dependencies
```
pnpm install
```

Optional: Redis seeded testing (recommended for local demos)
------------------------------------------------

If your Gemini key is missing, rate-limited, or you want deterministic responses, you can use Redis seeded results.

1) Start Redis (from repo root)
```
pnpm redis:up
```

2) Seed Redis with test data
```
pnpm backend:seed
```

3) Enable seeded mode in `healthcare-backend/.env`
```
REDIS_SEEDED_ANALYSIS_ENABLED=1
REDIS_URL=redis://localhost:6379/0
REDIS_SEED_PREFIX=symptom-checker:seed
```

4) (Optional) Run the Redis seeded backend test
```
pnpm test:backend:redis
```

4) Start the dev server
```
pnpm dev
# App will be available at http://localhost:3000
```


Optional: Redis caching for LLM responses (recommended)
------------------------------------------------

The Next.js backend route (`app/api/analyze/route.ts`) can cache successful LLM responses in Redis to reduce latency and cost.

1) Start Redis (from repo root)
```
pnpm redis:up
```

2) Add Redis URL to `.env.local`
```
REDIS_URL=redis://localhost:6379/0
ANALYZE_CACHE_TTL_SECONDS=86400
```

3) Start the app
```
pnpm dev
```

When enabled, responses include an `x-cache` header:
- `HIT` for cached responses
- `MISS` for freshly generated responses
- `BYPASS` when caching is disabled


Frontend to Backend Flow
------------------------------------------------
- The Next.js route `app/api/analyze/route.ts` runs on the server and calls the Hugging Face Inference API using `HF_API_KEY`.
- The route returns a structured JSON response to the client.


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
- Add environment variables `HF_API_KEY` and `HF_MODEL_NAME` (and optional tuning vars).
- For caching in production, also add `REDIS_URL` (managed Redis) and optional `ANALYZE_CACHE_TTL_SECONDS`.
- Use default build settings for Next.js 15.
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
