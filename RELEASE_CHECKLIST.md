# Release Checklist

Use this list before every push to GitHub or manual Render deployment.

## 1. Environment
- [ ] Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_BACKEND_URL`
- [ ] Copy `healthcare-backend/.env.example` to `healthcare-backend/.env` and set `GEMINI_API_KEY` (+ optional overrides)

## 2. Local verification
- [ ] Install frontend deps: `pnpm install`
- [ ] Install backend deps: `pnpm backend:install`
- [ ] Start backend locally: `pnpm backend:dev` (keep running)
- [ ] In a new terminal: `pnpm dev` and submit a sample symptom

## 3. Automated checks
- [ ] Run `pnpm check:all` (runs ESLint + backend smoke test)
- [ ] Optionally run `pnpm build` to ensure Next.js production build succeeds

## 4. Deployment prep
- [ ] Commit all changes (env files stay untracked)
- [ ] Push to GitHub (`git push origin main`)
- [ ] Confirm Render service root directory = `healthcare-backend`, build command = `pip install -r requirements.txt`, start command = `python app.py`
- [ ] Confirm Render env vars `GEMINI_API_KEY` (and `GEMINI_MODEL` if used) are present

## 5. Post-deploy smoke test
- [ ] Visit `https://healthcare-symptom-checker-backend-xktt.onrender.com` and confirm the health JSON
- [ ] Visit the Vercel frontend (or local dev site pointing to Render) and analyze sample symptoms
