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
}

function jsonResponse(statusCode: number, payload: Record<string, unknown>): ApiGatewayHttpResult {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  }
}

export async function handler(event: ApiGatewayHttpEvent): Promise<ApiGatewayHttpResult> {
  try {
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

    const result = await analyzeSymptoms(symptoms)

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
