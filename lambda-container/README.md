Lambda container image (Node.js 24)

This folder contains a Dockerfile that packages the symptom analysis Lambda handler as a container image.

What it builds
- Bundles `lambda/analyze.ts` + shared logic (`lib/analyze.ts`, `lib/huggingface.ts`, `lib/redis.ts`) into a single `index.js`.
- Uses the AWS Lambda Node.js base image and sets handler to `index.handler`.

Build locally
From repo root:

  docker build -f lambda-container/Dockerfile -t symptom-checker-lambda:latest .

Environment variables (set in Lambda, not in the image)
Required:
- HF_API_KEY
- HF_MODEL_NAME

Optional (recommended):
- REDIS_URL
- ANALYZE_CACHE_TTL_SECONDS
- ANALYZE_CACHE_ENABLED
- HF_TEMPERATURE
- HF_MAX_TOKENS
- ANALYZE_TIMEOUT_MS
- HF_BASE_URL

Deploy to AWS Lambda (container image)
1) Create an ECR repo (once):
   - symptom-checker-lambda

2) Authenticate Docker to ECR:
   aws ecr get-login-password --region <region> | docker login --username AWS --password-stdin <account>.dkr.ecr.<region>.amazonaws.com

3) Tag + push:
   docker tag symptom-checker-lambda:latest <account>.dkr.ecr.<region>.amazonaws.com/symptom-checker-lambda:latest
   docker push <account>.dkr.ecr.<region>.amazonaws.com/symptom-checker-lambda:latest

4) Create Lambda function from the image:
   - Package type: Container image
   - Image URI: <account>.dkr.ecr.<region>.amazonaws.com/symptom-checker-lambda:latest

5) Add an API Gateway HTTP API integration pointing to the Lambda.

Testing note
- Your earlier Docker error (`//./pipe/dockerDesktopLinuxEngine`) means Docker Desktop isn’t running. Start Docker Desktop before building/pushing.
