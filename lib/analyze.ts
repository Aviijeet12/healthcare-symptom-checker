import crypto from "crypto"

import { HFError, generateHFResponse } from "./huggingface"
import { getAnalysisCache, normalizeSymptomKey } from "./mem-cache"
import { redisGetJson, redisSetJson } from "./redis"

export type Condition = {
  name: string
  description: string
}

export type AnalysisResult = {
  conditions: Condition[]
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
    "",
    "- conditions: array of EXACTLY 5 objects, each with:",
    '  - "name": short condition name (max 5 words)',
    '  - "description": 1-2 sentence educational explanation of the condition, what causes it, and how it relates to the symptoms',
    "- recommendations: a clear, actionable paragraph (2-4 sentences) with specific steps the user should take, such as rest, hydration, OTC medication, or when to see a doctor",
    "- disclaimer: ONE sentence stating this is educational only (max 20 words)",
    "",
    "Rules:",
    "- Output MUST be valid JSON only — no markdown, no code fences, no extra text before or after.",
    "- You MUST return EXACTLY 5 conditions, no more, no less.",
    "- Keep the ENTIRE response under 600 tokens.",
    "- Do not include any additional keys.",
    "- Be conservative: avoid diagnosis certainty. Use words like 'possible' or 'may'.",
    "- Recommendations should be practical and specific to the symptoms described.",
    "",
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

function stripMarkdownFences(value: string): string {
  // Remove ```json ... ``` or ``` ... ``` wrappers
  let cleaned = value.trim()
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/, "")
  return cleaned.trim()
}

function fixCommonJsonIssues(value: string): string {
  // Remove trailing commas before } or ]
  let fixed = value.replace(/,\s*([}\]])/g, "$1")
  // Replace single-quoted strings with double-quoted (simple heuristic)
  // Only if there are no double quotes at all (to avoid breaking valid JSON)
  if (!fixed.includes('"') && fixed.includes("'")) {
    fixed = fixed.replace(/'/g, '"')
  }
  return fixed
}

function extractFirstJsonObject(value: string): string | null {
  const start = value.indexOf("{")
  const end = value.lastIndexOf("}")
  if (start < 0 || end < 0 || end <= start) return null
  return value.slice(start, end + 1)
}

/**
 * Attempt to recover a truncated JSON object from an LLM response.
 * The model sometimes runs out of tokens mid-sentence, producing something like:
 *   {"conditions":["A","B"],"recommendations":"Do X and stay hydr
 * We try to close open strings/arrays/objects to salvage what we can.
 */
function tryRecoverTruncatedJson(value: string): string | null {
  const start = value.indexOf("{")
  if (start < 0) return null
  let text = value.slice(start)

  // If it already ends with }, it's not truncated in this way
  if (text.trimEnd().endsWith("}")) return null

  // Close any open string
  const quoteCount = (text.match(/(?<!\\)"/g) || []).length
  if (quoteCount % 2 !== 0) {
    text += '"'
  }

  // Close open arrays and objects
  const opens = (text.match(/[{[]/g) || []).length
  const closes = (text.match(/[}\]]/g) || []).length
  // Remove any trailing comma
  text = text.replace(/,\s*$/, "")
  for (let i = 0; i < opens - closes; i++) {
    // Decide whether to close ] or } based on what was opened
    const lastOpen = text.lastIndexOf("[")
    const lastClose = text.lastIndexOf("]")
    if (lastOpen > lastClose) {
      text += "]"
    } else {
      text += "}"
    }
  }

  return text
}

function normalizeCondition(c: unknown): Condition | null {
  if (typeof c === "string" && c.trim()) {
    return { name: c.trim(), description: "" }
  }
  if (c && typeof c === "object") {
    const rec = c as Record<string, unknown>
    const name = typeof rec.name === "string" ? rec.name.trim() : typeof rec.condition === "string" ? rec.condition.trim() : ""
    const description = typeof rec.description === "string" ? rec.description.trim() : typeof rec.info === "string" ? rec.info.trim() : typeof rec.details === "string" ? rec.details.trim() : ""
    if (name) return { name, description }
  }
  return null
}

export function validateAnalysisResult(value: unknown): AnalysisResult | null {
  if (!value || typeof value !== "object") return null
  const record = value as Record<string, unknown>

  const rawConditions = record.conditions
  const recommendations = record.recommendations
  const disclaimer = record.disclaimer

  if (!Array.isArray(rawConditions) || rawConditions.length === 0) return null
  if (typeof recommendations !== "string" || !recommendations.trim()) return null
  if (typeof disclaimer !== "string" || !disclaimer.trim()) return null

  const conditions = rawConditions.map(normalizeCondition).filter((c): c is Condition => c !== null).slice(0, 6)
  if (conditions.length === 0) return null

  return {
    conditions,
    recommendations: recommendations.trim(),
    disclaimer: disclaimer.trim(),
  }
}

function coerceToAnalysisResult(value: unknown): AnalysisResult | null {
  if (!value || typeof value !== "object") return null
  const record = value as Record<string, unknown>

  // Common near-misses from LLMs:
  // - conditions is a single string with comma/newline separated items
  // - recommendations is an array of strings
  // - disclaimer missing or empty
  // - slightly different key names
  const rawConditions =
    record.conditions ??
    record.possible_conditions ??
    record.possibleConditions ??
    record.differentials ??
    record.differential ??
    record.condition ??
    record.conditions_list

  const rawRecommendations = record.recommendations ?? record.recommendation ?? record.advice
  const rawDisclaimer = record.disclaimer ?? record.disclaimer_text ?? record.disclaimerText

  const normalizeConditionText = (text: string) => text.replace(/^[-*\u2022\s]+/, "").trim()

  let conditions: Condition[] = []
  if (Array.isArray(rawConditions)) {
    conditions = rawConditions
      .map(normalizeCondition)
      .filter((c): c is Condition => c !== null)
  } else if (typeof rawConditions === "string") {
    conditions = rawConditions
      .split(/[\n,;]+/)
      .map((c) => normalizeConditionText(c))
      .filter(Boolean)
      .map((name) => ({ name, description: "" }))
  }

  let recommendations = ""
  if (typeof rawRecommendations === "string") {
    recommendations = rawRecommendations.trim()
  } else if (Array.isArray(rawRecommendations)) {
    recommendations = rawRecommendations
      .map((r) => (typeof r === "string" ? r.trim() : r == null ? "" : String(r).trim()))
      .filter(Boolean)
      .join(" ")
      .trim()
  }

  let disclaimer = ""
  if (typeof rawDisclaimer === "string") {
    disclaimer = rawDisclaimer.trim()
  }

  if (!disclaimer) {
    disclaimer = "Educational purposes only. Not medical advice. Consult a qualified professional."
  }

  if (!conditions.length || !recommendations) return null

  return {
    conditions: conditions.slice(0, 6),
    recommendations,
    disclaimer,
  }
}


function parseAnalysisJson(text: string): AnalysisResult | null {
  const raw = (text || "").trim()
  if (!raw) return null

  // Try raw text as-is
  const direct = safeJsonParse(raw)
  const validated = validateAnalysisResult(direct)
  if (validated) return validated

  const coercedDirect = coerceToAnalysisResult(direct)
  if (coercedDirect) return coercedDirect

  // Strip markdown fences and try again
  const stripped = stripMarkdownFences(raw)
  if (stripped !== raw) {
    const strippedParsed = safeJsonParse(stripped)
    const strippedValidated = validateAnalysisResult(strippedParsed) ?? coerceToAnalysisResult(strippedParsed)
    if (strippedValidated) return strippedValidated
  }

  // Extract first JSON object from surrounding text
  const textToParse = stripped || raw
  const extracted = extractFirstJsonObject(textToParse)
  if (extracted) {
    const parsed = safeJsonParse(extracted)
    const result = validateAnalysisResult(parsed) ?? coerceToAnalysisResult(parsed)
    if (result) return result

    // Fix common LLM JSON issues (trailing commas, etc) and retry
    const fixed = fixCommonJsonIssues(extracted)
    if (fixed !== extracted) {
      const fixedParsed = safeJsonParse(fixed)
      const fixedResult = validateAnalysisResult(fixedParsed) ?? coerceToAnalysisResult(fixedParsed)
      if (fixedResult) return fixedResult
    }
  }

  // Last resort: try to recover truncated JSON (model ran out of tokens)
  const recovered = tryRecoverTruncatedJson(textToParse)
  if (recovered) {
    const recoveredParsed = safeJsonParse(recovered)
    const recoveredResult = validateAnalysisResult(recoveredParsed) ?? coerceToAnalysisResult(recoveredParsed)
    if (recoveredResult) return recoveredResult
  }

  return null
}

export async function analyzeSymptoms(symptoms: string, opts: AnalysisOptions = {}): Promise<AnalysisResult> {
  const cleanedSymptoms = typeof symptoms === "string" ? symptoms.trim() : ""
  if (!cleanedSymptoms) {
    throw new AnalysisError("Missing or invalid 'symptoms' in request body.", "INVALID_INPUT")
  }

  if (!process.env.HF_API_KEY || !process.env.HF_API_KEY.trim()) {
    throw new AnalysisError("Server is missing HF_API_KEY.", "SERVER_MISCONFIGURED")
  }

  const primaryModel = (process.env.HF_MODEL_NAME ?? "").trim()
  const fallbackModel = (process.env.HF_FALLBACK_MODEL_NAME ?? "").trim()

  if (!primaryModel && !fallbackModel) {
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
        model: primaryModel || fallbackModel,
        temperature: typeof temperature === "number" ? temperature : undefined,
        maxTokens: typeof maxTokens === "number" ? maxTokens : undefined,
      })
    : null

  // ── In-memory cache (sub-millisecond) ──────────────────────────
  const memCache = getAnalysisCache()
  const memKey = normalizeSymptomKey(cleanedSymptoms)

  const memHit = memCache.get(memKey) as AnalysisResult | undefined
  if (memHit) {
    console.info(`[analyze] memory cache HIT (key=${memKey.slice(0, 40)}…)`)
    return memHit
  }

  // ── Redis cache (optional) ─────────────────────────────────────
  if (cacheKey) {
    const cached = await redisGetJson<AnalysisResult>(cacheKey)
    const validated = validateAnalysisResult(cached)
    if (validated) {
      // Promote to memory cache for next time
      memCache.set(memKey, validated)
      return validated
    }
  }

  const prompt = buildSymptomAnalysisPrompt(cleanedSymptoms)

  const genConfig = {
    temperature: typeof temperature === "number" ? temperature : undefined,
    maxTokens: typeof maxTokens === "number" ? maxTokens : undefined,
    timeoutMs: typeof timeoutMs === "number" ? timeoutMs : undefined,
  }

  // Fast path: try primary model with reduced retries for speed
  const modelsToTry = primaryModel
    ? fallbackModel
      ? [primaryModel, fallbackModel]
      : [primaryModel]
    : [fallbackModel]

  let lastError: unknown = null

  for (const model of modelsToTry) {
    const isPrimary = model === modelsToTry[0]
    const isFallback = !isPrimary

    try {
      const result = await generateHFResponse(prompt, {
        ...genConfig,
        model,
        // Primary: only 1 retry for speed. Fallback: full 3 retries for reliability.
        maxRetries: isPrimary && modelsToTry.length > 1 ? 1 : 3,
      })

      let parsed = parseAnalysisJson(result.text)

      if (!parsed) {
        console.warn(`[analyze] bad output from ${model}, retrying once. Raw:`, result.text.slice(0, 200))
        const retry = await generateHFResponse(prompt, { ...genConfig, model, maxRetries: 0 })
        parsed = parseAnalysisJson(retry.text)
      }

      if (parsed) {
        if (isFallback) console.info(`[analyze] fallback model ${model} succeeded`)
        // Store in memory cache (instant next time)
        memCache.set(memKey, parsed)
        if (cacheKey) {
          await redisSetJson(cacheKey, parsed, {
            ttlSeconds: typeof cacheTtlSeconds === "number" ? cacheTtlSeconds : 24 * 60 * 60,
          })
        }
        return parsed
      }

      // Parsed failed — if there's a fallback, try it instead of throwing
      lastError = new AnalysisError("AI returned an unexpected format.", "BAD_LLM_OUTPUT")
      if (isFallback || modelsToTry.length === 1) throw lastError
      console.warn(`[analyze] primary model ${model} returned bad output, trying fallback...`)
      continue
    } catch (err) {
      lastError = err
      // If this is the last model, throw
      if (isFallback || modelsToTry.length === 1) throw err
      // Otherwise, log and try fallback
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`[analyze] primary model ${model} failed (${msg}), trying fallback ${modelsToTry[1]}...`)
      continue
    }
  }

  // Should never reach here
  throw lastError ?? new AnalysisError("AI returned an unexpected format.", "BAD_LLM_OUTPUT")
}

export function mapErrorToHttp(err: unknown): { statusCode: number; payload: Record<string, unknown> } {
  if (err instanceof AnalysisError) {
    if (err.code === "INVALID_INPUT") {
      return { statusCode: 400, payload: { error: err.message, code: "INVALID_INPUT" } }
    }

    if (err.code === "SERVER_MISCONFIGURED") {
      const isProd = (process.env.NODE_ENV ?? "").toLowerCase() === "production"
      return {
        statusCode: 500,
        payload: {
          error: isProd ? "Server misconfigured." : err.message,
          code: "SERVER_MISCONFIGURED",
        },
      }
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
