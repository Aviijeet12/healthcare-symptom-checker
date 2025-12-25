# Deployment Instructions - Symptom Checker (Hugging Face + Redis Cache)

This repo runs as a single Next.js app (frontend + backend API route). The symptom analysis endpoint is:

- `POST /api/analyze` (Next.js server runtime)

It calls Hugging Face Inference Providers (router) and can optionally cache results in Redis.


## Required Environment Variables (Production)

- `HF_API_KEY` (required)
- `HF_MODEL_NAME` (required) e.g. `meta-llama/Llama-3.1-8B-Instruct`


## Optional: Redis Cache (Recommended)

Caching reduces latency and avoids repeated LLM calls for the same symptom query.

- `REDIS_URL` (enables caching when set)
  - Local docker: `redis://localhost:6379/0`
  - Production: use a managed Redis (Upstash/Redis Cloud/etc) and set its URL
- `ANALYZE_CACHE_TTL_SECONDS` (default 86400)
- `ANALYZE_CACHE_ENABLED` (default enabled when `REDIS_URL` is set)

When caching is enabled, responses include an `x-cache` header:
- `HIT` cached response
- `MISS` generated response
- `BYPASS` caching disabled


## Deploy to Vercel (Recommended)

1) Import the repo into Vercel

2) Add environment variables:
- `HF_API_KEY`
- `HF_MODEL_NAME`
- (Optional) `REDIS_URL`, `ANALYZE_CACHE_TTL_SECONDS`

3) Deploy

Notes:
- Vercel does not run docker-compose services. For Redis on Vercel, you must use a managed Redis and set `REDIS_URL`.


## Local “Production-like” Run (Redis + App)

Prerequisite: Docker Desktop must be running.

1) Start Redis
```
pnpm redis:up
```

2) Configure `.env.local`
```
REDIS_URL=redis://localhost:6379/0
ANALYZE_CACHE_TTL_SECONDS=86400
```

3) Start the app
```
pnpm dev
```

4) Verify caching
- First request: `x-cache: MISS`
- Second request (same symptoms/model/settings): `x-cache: HIT`


## Troubleshooting

- Docker error `open //./pipe/dockerDesktopLinuxEngine`: Docker Desktop isn’t running. Start Docker Desktop, then retry `pnpm redis:up`.
- No caching even with `REDIS_URL`: check app logs for `[redis] connect_failed ...` and confirm your Redis URL is reachable from the deployment environment.
