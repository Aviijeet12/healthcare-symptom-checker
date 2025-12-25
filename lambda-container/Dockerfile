# Lambda container image for the symptom-checker analyze endpoint
# Build: docker build -f lambda-container/Dockerfile -t symptom-checker-lambda:latest .
# Run locally (requires AWS Lambda Runtime Interface Emulator): see README below.

# --- Build stage: bundle TS -> single JS file ---
FROM node:24-bookworm-slim AS build

WORKDIR /app

# Enable pnpm via corepack
RUN corepack enable

# Copy dependency manifests first for better layer caching
COPY package.json pnpm-lock.yaml ./

# Install deps (includes dev deps needed for esbuild)
RUN pnpm install --frozen-lockfile

# Copy only the code needed to build the lambda bundle
COPY tsconfig.json ./
COPY lambda ./lambda
COPY lib ./lib

# Bundle into a single CommonJS file named index.js exporting handler
RUN pnpm -s dlx esbuild ./lambda/analyze.ts \
  --bundle \
  --platform=node \
  --target=node24 \
  --format=cjs \
  --outfile=./dist/index.js


# --- Runtime stage: AWS Lambda Node.js 24 base image ---
# If this tag is not available in your account/region, switch to nodejs:22 or nodejs:20.
FROM public.ecr.aws/lambda/nodejs:24

# Copy the built artifact into the Lambda task root
COPY --from=build /app/dist/index.js ${LAMBDA_TASK_ROOT}/index.js

# Set the Lambda handler
CMD ["index.handler"]
