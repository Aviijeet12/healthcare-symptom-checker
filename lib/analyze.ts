import crypto from "crypto"

import { HFError, generateHFResponse } from "./huggingface"
import { redisGetJson, redisSetJson } from "./redis"

export type AnalysisResult = {
  conditions: string[]
  recommendations: string
  disclaimer: string
}

export type AnalysisOptions = {
  age?: number
  sex?: string
  duration?: string
  temperature?: number
  maxTokens?: number
  timeoutMs?: number
}

export class AnalysisError extends Error {
  readonly code:
    | "INVALID_INPUT"
    | "SERVER_MISCONFIGURED"
    | "BAD_LLM_OUTPUT"
    | "UPSTREAM_ERROR"

  constructor(message: string, code: AnalysisError["code"]) {
    super(message)
    this.name = "AnalysisError"
    this.code = code
  }
}

function parseNumber(value: string | undefined): number | undefined {
  if (!value) return undefined
  const n = Number(value)
  if (!Number.isFinite(n)) return undefined
  return n
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase()
}

function shouldEnableCache(): boolean {
  const url = (process.env.REDIS_URL ?? "").trim()
  if (!url) return false

  const flag = (process.env.ANALYZE_CACHE_ENABLED ?? "").trim().toLowerCase()
  if (!flag) return true
  return !(flag === "0" || flag === "false" || flag === "off" || flag === "no")
}

function buildAnalyzeCacheKey(input: {
  symptoms: string
  age?: number
  sex?: string
  duration?: string
  model?: string
  temperature?: number
  maxTokens?: number
}): string {
  const stable = {
    v: 1,
    symptoms: normalizeText(input.symptoms),
    age: typeof input.age === "number" ? input.age : null,
    sex: input.sex ? normalizeText(input.sex) : null,
    duration: input.duration ? normalizeText(input.duration) : null,
    model: (input.model ?? "").trim(),
    temperature: typeof input.temperature === "number" ? input.temperature : null,
    maxTokens: typeof input.maxTokens === "number" ? input.maxTokens : null,
  }

  const hash = crypto.createHash("sha256").update(JSON.stringify(stable)).digest("hex")
  return `symptom-checker:analyze:v1:${hash}`
}

function buildSymptomAnalysisPrompt(symptoms: string): string {
  return [
    "You are a cautious health education assistant.",
    "Task: Given the user's symptom description, return ONLY a valid JSON object with EXACTLY these keys:",
    "- conditions: array of 2 to 5 short possible conditions (strings)",
    "- recommendations: a single concise paragraph (string)",
    "- disclaimer: a single sentence stating this is educational only and not medical advice (string)",
    "Rules:",
    "- Output MUST be JSON only (no markdown, no code fences, no extra text).",
    "- Do not include any additional keys.",
    "- Be conservative: avoid diagnosis certainty.",
    "User symptoms:",
    symptoms,
  ].join("\n")
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function extractFirstJsonObject(value: string): string | null {
  const start = value.indexOf("{")
  const end = value.lastIndexOf("}")
  if (start < 0 || end < 0 || end <= start) return null
  return value.slice(start, end + 1)
}

export function validateAnalysisResult(value: unknown): AnalysisResult | null {
  if (!value || typeof value !== "object") return null
  const record = value as Record<string, unknown>

  const conditions = record.conditions
  const recommendations = record.recommendations
  const disclaimer = record.disclaimer

  if (!Array.isArray(conditions) || !conditions.every((c) => typeof c === "string" && c.trim())) return null
  if (typeof recommendations !== "string" || !recommendations.trim()) return null
  if (typeof disclaimer !== "string" || !disclaimer.trim()) return null

  return {
    conditions: conditions.map((c) => c.trim()).slice(0, 5),
    recommendations: recommendations.trim(),
    disclaimer: disclaimer.trim(),
  }
}

function parseAnalysisJson(text: string): AnalysisResult | null {
  const raw = (text || "").trim()
  if (!raw) return null

  const direct = safeJsonParse(raw)
  const validated = validateAnalysisResult(direct)
  if (validated) return validated

  const extracted = extractFirstJsonObject(raw)
  if (!extracted) return null
  const parsed = safeJsonParse(extracted)
  return validateAnalysisResult(parsed)
}

export async function analyzeSymptoms(symptoms: string, opts: AnalysisOptions = {}): Promise<AnalysisResult> {
  const cleanedSymptoms = typeof symptoms === "string" ? symptoms.trim() : ""
  if (!cleanedSymptoms) {
    throw new AnalysisError("Missing or invalid 'symptoms' in request body.", "INVALID_INPUT")
  }

  if (!process.env.HF_API_KEY || !process.env.HF_API_KEY.trim()) {
    throw new AnalysisError("Server is missing HF_API_KEY.", "SERVER_MISCONFIGURED")
  }

  if (!process.env.HF_MODEL_NAME || !process.env.HF_MODEL_NAME.trim()) {
    throw new AnalysisError("Server is missing HF_MODEL_NAME.", "SERVER_MISCONFIGURED")
  }

  const temperature = typeof opts.temperature === "number" ? opts.temperature : parseNumber(process.env.HF_TEMPERATURE)
  const maxTokens = typeof opts.maxTokens === "number" ? opts.maxTokens : parseNumber(process.env.HF_MAX_TOKENS)
  const timeoutMs = typeof opts.timeoutMs === "number" ? opts.timeoutMs : parseNumber(process.env.ANALYZE_TIMEOUT_MS)

  const cacheTtlSeconds = parseNumber(process.env.ANALYZE_CACHE_TTL_SECONDS)
  const cacheEnabled = shouldEnableCache()

  const cacheKey = cacheEnabled
    ? buildAnalyzeCacheKey({
        symptoms: cleanedSymptoms,
        age: opts.age,
        sex: opts.sex,
        duration: opts.duration,
        model: process.env.HF_MODEL_NAME,
        temperature: typeof temperature === "number" ? temperature : undefined,
        maxTokens: typeof maxTokens === "number" ? maxTokens : undefined,
      })
    : null

  if (cacheKey) {
    const cached = await redisGetJson<AnalysisResult>(cacheKey)
    const validated = validateAnalysisResult(cached)
    if (validated) {
      return validated
    }
  }

  const prompt = buildSymptomAnalysisPrompt(cleanedSymptoms)

  const result = await generateHFResponse(prompt, {
    temperature: typeof temperature === "number" ? temperature : undefined,
    maxTokens: typeof maxTokens === "number" ? maxTokens : undefined,
    timeoutMs: typeof timeoutMs === "number" ? timeoutMs : undefined,
  })

  const parsed = parseAnalysisJson(result.text)
  if (!parsed) {
    throw new AnalysisError("AI returned an unexpected format.", "BAD_LLM_OUTPUT")
  }

  if (cacheKey) {
    await redisSetJson(cacheKey, parsed, {
      ttlSeconds: typeof cacheTtlSeconds === "number" ? cacheTtlSeconds : 24 * 60 * 60,
    })
  }

  return parsed
}

export function mapErrorToHttp(err: unknown): { statusCode: number; payload: Record<string, unknown> } {
  if (err instanceof AnalysisError) {
    if (err.code === "INVALID_INPUT") {
      return { statusCode: 400, payload: { error: err.message, code: "INVALID_INPUT" } }
    }

    if (err.code === "SERVER_MISCONFIGURED") {
      return { statusCode: 500, payload: { error: "Server misconfigured.", code: "SERVER_MISCONFIGURED" } }
    }

    if (err.code === "BAD_LLM_OUTPUT") {
      return { statusCode: 502, payload: { error: "AI returned an unexpected format. Please try again.", code: "BAD_LLM_OUTPUT" } }
    }

    return { statusCode: 500, payload: { error: "Failed to process your request.", code: "PROCESSING_ERROR" } }
  }

  if (err instanceof HFError) {
    if (err.code === "HF_AUTH_ERROR") {
      return { statusCode: 401, payload: { error: "Hugging Face authentication failed.", code: "HF_AUTH_ERROR" } }
    }

    if (err.code === "HF_RATE_LIMIT") {
      return { statusCode: 429, payload: { error: "Rate limited by Hugging Face. Please try again shortly.", code: "HF_RATE_LIMIT" } }
    }

    if (err.code === "HF_MODEL_LOADING") {
      return { statusCode: 503, payload: { error: "Model is still loading. Please try again in a few seconds.", code: "HF_MODEL_LOADING" } }
    }

    if (err.code === "HF_TIMEOUT") {
      return { statusCode: 504, payload: { error: "The analysis request timed out. Please try again.", code: "TIMEOUT" } }
    }

    // Treat other HF transient/upstream errors as 503 (per requirement).
    return { statusCode: 503, payload: { error: "AI service error. Please try again.", code: err.code } }
  }

  return { statusCode: 500, payload: { error: "Failed to process your request. Please try again.", code: "PROCESSING_ERROR" } }
}
