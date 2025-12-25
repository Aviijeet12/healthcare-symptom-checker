export type HFGenerationConfig = {
  model?: string
  temperature?: number
  maxTokens?: number
  baseUrl?: string
  timeoutMs?: number
  maxRetries?: number
  minBackoffMs?: number
  maxBackoffMs?: number
  waitForModelMaxMs?: number
}

export type HFGenerationResult = {
  text: string
  model: string
  latencyMs: number
  retries: number
}

type HFErrorCode =
  | "HF_AUTH_ERROR"
  | "HF_RATE_LIMIT"
  | "HF_MODEL_LOADING"
  | "HF_TIMEOUT"
  | "HF_UPSTREAM_ERROR"
  | "HF_BAD_REQUEST"

export class HFError extends Error {
  readonly code: HFErrorCode
  readonly status?: number
  readonly details?: unknown

  constructor(message: string, opts: { code: HFErrorCode; status?: number; details?: unknown }) {
    super(message)
    this.name = "HFError"
    this.code = opts.code
    this.status = opts.status
    this.details = opts.details
  }
}

function clampNumber(value: number | undefined, opts: { min: number; max: number; fallback: number }): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return opts.fallback
  return Math.min(opts.max, Math.max(opts.min, value))
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function backoffDelayMs(attempt: number, minBackoffMs: number, maxBackoffMs: number): number {
  // Exponential backoff with a little jitter.
  const exp = minBackoffMs * Math.pow(2, Math.max(0, attempt - 1))
  const jitter = 0.75 + Math.random() * 0.5
  return Math.min(maxBackoffMs, Math.floor(exp * jitter))
}

function coerceModelName(model: string | undefined): string {
  const envModel = process.env.HF_MODEL_NAME
  const effective = (model ?? envModel ?? "").trim()
  if (!effective) {
    throw new HFError(
      "Missing Hugging Face model name. Set HF_MODEL_NAME (recommended) or pass config.model.",
      { code: "HF_BAD_REQUEST" },
    )
  }
  return effective
}

function requireApiKey(): string {
  const apiKey = (process.env.HF_API_KEY ?? "").trim()
  if (!apiKey) {
    throw new HFError("Missing Hugging Face API key. Set HF_API_KEY in your server environment.", {
      code: "HF_AUTH_ERROR",
      status: 401,
    })
  }
  return apiKey
}

function parseRetryAfterMs(response: Response): number | null {
  const header = response.headers.get("retry-after")
  if (!header) return null

  // retry-after can be seconds or HTTP date. We support seconds.
  const seconds = Number(header)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.floor(seconds * 1000)
  return null
}

function tryExtractHFError(payload: unknown): { message?: string; estimatedTimeSeconds?: number } {
  if (!payload || typeof payload !== "object") return {}
  const record = payload as Record<string, unknown>

  const message =
    typeof record.error === "string"
      ? record.error
      : record.error && typeof record.error === "object" && typeof (record.error as Record<string, unknown>).message === "string"
        ? String((record.error as Record<string, unknown>).message)
        : undefined
  const estimated = typeof record.estimated_time === "number" && Number.isFinite(record.estimated_time) ? record.estimated_time : undefined

  return { message, estimatedTimeSeconds: estimated }
}

function parseGeneratedText(payload: unknown): string {
  // Router (OpenAI-compatible) response shape:
  // { choices: [ { message: { content: "..." } } ] }
  const routerText = tryGetRouterChatCompletionText(payload)
  if (routerText) return routerText

  throw new HFError("Unexpected Hugging Face response format (missing choices/message.content).", {
    code: "HF_UPSTREAM_ERROR",
    details: payload,
  })
}

function tryGetRouterChatCompletionText(value: unknown): string | null {
  if (!value || typeof value !== "object") return null
  const record = value as Record<string, unknown>
  const choices = record.choices
  if (!Array.isArray(choices) || choices.length === 0) return null
  const first = choices[0]
  if (!first || typeof first !== "object") return null
  const firstRecord = first as Record<string, unknown>
  const message = firstRecord.message
  if (!message || typeof message !== "object") return null
  const messageRecord = message as Record<string, unknown>
  const content = messageRecord.content
  if (typeof content === "string" && content.trim()) return content
  return null
}

export async function generateHFResponse(
  prompt: string,
  config: HFGenerationConfig = {},
): Promise<HFGenerationResult> {
  const cleanedPrompt = typeof prompt === "string" ? prompt.trim() : ""
  if (!cleanedPrompt) {
    throw new HFError("Prompt must be a non-empty string.", { code: "HF_BAD_REQUEST" })
  }

  const apiKey = requireApiKey()
  const model = coerceModelName(config.model)

  const baseUrl = (config.baseUrl ?? process.env.HF_BASE_URL ?? "https://router.huggingface.co/v1").trim().replace(/\/+$/, "")

  const temperature = clampNumber(config.temperature, { min: 0, max: 2, fallback: 0.2 })
  const maxTokens = clampNumber(config.maxTokens, { min: 1, max: 2048, fallback: 512 })

  const timeoutMs = clampNumber(config.timeoutMs, { min: 3000, max: 60000, fallback: 30000 })
  const maxRetries = clampNumber(config.maxRetries, { min: 0, max: 6, fallback: 3 })

  const minBackoffMs = clampNumber(config.minBackoffMs, { min: 100, max: 10_000, fallback: 400 })
  const maxBackoffMs = clampNumber(config.maxBackoffMs, { min: 500, max: 60_000, fallback: 8_000 })

  const waitForModelMaxMs = clampNumber(config.waitForModelMaxMs, { min: 0, max: 120_000, fallback: 25_000 })

  const url = `${baseUrl}/chat/completions`

  const startAll = Date.now()
  let retries = 0

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const attemptStart = Date.now()
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    try {
      if (attempt > 0) {
        retries = attempt
      }

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: cleanedPrompt }],
          temperature,
          max_tokens: maxTokens,
          stream: false,
        }),
        signal: controller.signal,
        cache: "no-store",
      })

      const latencyMs = Date.now() - attemptStart

      // Attempt to parse JSON, but keep a text fallback.
      let payload: unknown = null
      const contentType = response.headers.get("content-type") || ""
      if (contentType.includes("application/json")) {
        payload = await response.json().catch(() => null)
      } else {
        payload = await response.text().catch(() => null)
      }

      if (response.status === 401) {
        throw new HFError("Unauthorized: invalid HF_API_KEY.", {
          code: "HF_AUTH_ERROR",
          status: 401,
          details: payload,
        })
      }

      if (response.status === 403) {
        const extracted = tryExtractHFError(payload)
        throw new HFError(
          extracted.message ||
            "Forbidden: your Hugging Face token may not have access to this model (gated/private) or lacks inference permissions.",
          {
            code: "HF_AUTH_ERROR",
            status: 403,
            details: payload,
          },
        )
      }

      // Model or request configuration issues.
      if (response.status === 404 || response.status === 410 || response.status === 422) {
        const extracted = tryExtractHFError(payload)
        const statusHint = response.status === 410 ? "Model is unavailable on the serverless Inference API." : ""
        throw new HFError(
          extracted.message ||
            `Hugging Face rejected the request (${response.status}). ${statusHint}`.trim(),
          {
            code: "HF_BAD_REQUEST",
            status: 400,
            details: payload,
          },
        )
      }

      if (response.status === 429) {
        const retryAfter = parseRetryAfterMs(response)
        console.warn(`[hf] 429 rate-limited (latency=${latencyMs}ms) attempt=${attempt + 1}/${maxRetries + 1}`)

        if (attempt >= maxRetries) {
          throw new HFError("Rate limited by Hugging Face. Please retry later.", {
            code: "HF_RATE_LIMIT",
            status: 429,
            details: payload,
          })
        }

        const delay = retryAfter ?? backoffDelayMs(attempt + 1, minBackoffMs, maxBackoffMs)
        console.info(`[hf] retrying after ${delay}ms (rate limit)`) 
        await sleep(delay)
        continue
      }

      // Model loading: HF commonly returns 503 with an "estimated_time".
      if (response.status === 503) {
        const extracted = tryExtractHFError(payload)
        const message = extracted.message ?? "Model is loading"
        const isLoading = /loading/i.test(message)

        if (isLoading && waitForModelMaxMs > 0) {
          const elapsed = Date.now() - startAll
          const remaining = waitForModelMaxMs - elapsed
          if (remaining <= 0) {
            throw new HFError("Model is still loading. Please try again shortly.", {
              code: "HF_MODEL_LOADING",
              status: 503,
              details: payload,
            })
          }

          const suggestedMs = extracted.estimatedTimeSeconds ? Math.floor(extracted.estimatedTimeSeconds * 1000) : 1200
          const delay = Math.min(Math.max(suggestedMs, 400), Math.min(6000, remaining))
          console.info(`[hf] model loading; polling again in ${delay}ms (elapsed=${elapsed}ms)`) 
          await sleep(delay)
          // Do not count this as a "retry" for rate limiting; but it's still another request.
          continue
        }
      }

      if (!response.ok) {
        // Transient upstream errors that are worth retrying.
        if ([500, 502, 503, 504].includes(response.status) && attempt < maxRetries) {
          const delay = backoffDelayMs(attempt + 1, minBackoffMs, maxBackoffMs)
          console.warn(`[hf] upstream ${response.status} (latency=${latencyMs}ms) retry in ${delay}ms`) 
          await sleep(delay)
          continue
        }

        const extracted = tryExtractHFError(payload)
        throw new HFError(extracted.message || "Hugging Face Inference API returned an error.", {
          code: "HF_UPSTREAM_ERROR",
          status: response.status,
          details: payload,
        })
      }

      const text = parseGeneratedText(payload)
      console.info(`[hf] success model=${model} latency=${latencyMs}ms retries=${retries}`)

      return {
        text,
        model,
        latencyMs,
        retries,
      }
    } catch (err: unknown) {
      clearTimeout(timeoutId)

      if (err instanceof HFError) {
        // For auth/bad request, don't retry.
        if (err.code === "HF_AUTH_ERROR" || err.code === "HF_BAD_REQUEST") {
          throw err
        }

        if (attempt >= maxRetries) {
          throw err
        }

        // Otherwise, allow loop retry logic to proceed (handled above for most statuses).
        // If we got here without a status-based continue, do a generic backoff retry.
        const delay = backoffDelayMs(attempt + 1, minBackoffMs, maxBackoffMs)
        console.warn(`[hf] ${err.code} retry in ${delay}ms`) 
        await sleep(delay)
        continue
      }

      const isAbort = err instanceof Error && err.name === "AbortError"
      if (isAbort) {
        console.warn(`[hf] timeout after ${timeoutMs}ms attempt=${attempt + 1}/${maxRetries + 1}`)
        if (attempt >= maxRetries) {
          throw new HFError("Request to Hugging Face timed out.", { code: "HF_TIMEOUT", status: 504 })
        }
        const delay = backoffDelayMs(attempt + 1, minBackoffMs, maxBackoffMs)
        await sleep(delay)
        continue
      }

      const message = err instanceof Error ? err.message : String(err)
      console.warn(`[hf] unexpected error: ${message}`)

      if (attempt >= maxRetries) {
        throw new HFError("Unexpected error calling Hugging Face.", {
          code: "HF_UPSTREAM_ERROR",
          details: message,
        })
      }

      const delay = backoffDelayMs(attempt + 1, minBackoffMs, maxBackoffMs)
      await sleep(delay)
    } finally {
      clearTimeout(timeoutId)
    }
  }

  // Should not happen.
  throw new HFError("Exhausted retries calling Hugging Face.", { code: "HF_UPSTREAM_ERROR" })
}
