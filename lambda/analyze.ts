import { analyzeSymptoms, mapErrorToHttp } from "../lib/analyze"

type ApiGatewayHttpEvent = {
  body?: string | null
  isBase64Encoded?: boolean
  headers?: Record<string, string | undefined>
  requestContext?: unknown
}

type ApiGatewayHttpResult = {
  statusCode: number
  headers: Record<string, string>
  body: string
  isBase64Encoded?: boolean
}

function jsonResponse(statusCode: number, payload: Record<string, unknown>): ApiGatewayHttpResult {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      // Safe default: allows browser clients if you call API Gateway directly.
      // (When called via Next.js server-to-server proxy, this header is harmless.)
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
    },
    body: JSON.stringify(payload),
    isBase64Encoded: false,
  }
}

type LambdaContextLike = {
  getRemainingTimeInMillis?: () => number
}

function emptyResponse(statusCode: number): ApiGatewayHttpResult {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
    },
    body: "",
    isBase64Encoded: false,
  }
}

export async function handler(event: ApiGatewayHttpEvent, context?: LambdaContextLike): Promise<ApiGatewayHttpResult> {
  try {
    // Handle CORS preflight (useful when calling API Gateway directly from a browser).
    const method =
      (event as any)?.requestContext?.http?.method || (event as any)?.requestContext?.httpMethod || (event as any)?.httpMethod
    if (typeof method === "string" && method.toUpperCase() === "OPTIONS") {
      return emptyResponse(204)
    }

    const rawBody = typeof event?.body === "string" ? event.body : ""
    const decodedBody = event?.isBase64Encoded ? Buffer.from(rawBody, "base64").toString("utf8") : rawBody

    let body: unknown = null
    if (event?.body && typeof event.body === "object") {
      // Some direct-invoke/test events pass body as an object already.
      body = event.body
    } else if (decodedBody) {
      try {
        body = JSON.parse(decodedBody) as unknown
      } catch {
        body = null
      }
    }

    const symptomsRaw = body && typeof body === "object" ? (body as Record<string, unknown>).symptoms : undefined
    const symptoms =
      typeof symptomsRaw === "string"
        ? symptomsRaw.trim()
        : Array.isArray(symptomsRaw)
          ? symptomsRaw
              .filter((v): v is string => typeof v === "string")
              .map((v) => v.trim())
              .filter(Boolean)
              .join(", ")
          : ""

    // Stay within API Gateway + Lambda timeouts. Leave a small buffer for JSON parsing + response.
    const remainingMs = typeof context?.getRemainingTimeInMillis === "function" ? context.getRemainingTimeInMillis() : null
    const timeoutBudgetMs = typeof remainingMs === "number" && Number.isFinite(remainingMs) ? Math.max(0, remainingMs - 500) : null
    const timeoutMs = typeof timeoutBudgetMs === "number" ? Math.min(25_000, timeoutBudgetMs) : undefined

    const result = await analyzeSymptoms(symptoms, { timeoutMs })

    return jsonResponse(200, result)
  } catch (err: unknown) {
    if (err instanceof Error) {
      console.error("[lambda] analyze error", { name: err.name, message: err.message, stack: err.stack })
    } else {
      console.error("[lambda] analyze error", { value: String(err) })
    }
    const mapped = mapErrorToHttp(err)
    return jsonResponse(mapped.statusCode, mapped.payload)
  }
}
