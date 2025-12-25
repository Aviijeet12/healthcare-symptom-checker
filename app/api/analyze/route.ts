import { analyzeSymptoms, mapErrorToHttp } from "@/lib/analyze"

export const runtime = "nodejs"
// Keep within typical serverless limits.
export const maxDuration = 60

function normalizeSymptoms(value: unknown): string {
  if (typeof value === "string") return value.trim()
  if (Array.isArray(value)) {
    const parts = value
      .filter((v): v is string => typeof v === "string")
      .map((v) => v.trim())
      .filter(Boolean)
    return parts.join(", ")
  }
  return ""
}

function getUpstreamUrl(): string | null {
  const raw = (process.env.ANALYZE_API_URL ?? "").trim()
  if (!raw) return null
  return raw
}

export async function POST(request: Request) {
  const requestStart = Date.now()

  try {
    const body = await request.json().catch(() => null)

    const symptoms = normalizeSymptoms(body?.symptoms)
    const age = typeof body?.age === "number" && Number.isFinite(body.age) ? body.age : undefined
    const sex = typeof body?.sex === "string" ? body.sex.trim() : undefined
    const duration = typeof body?.duration === "string" ? body.duration.trim() : undefined

    const upstreamUrl = getUpstreamUrl()
    if (upstreamUrl) {
      const upstreamResp = await fetch(upstreamUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symptoms, age, sex, duration }),
      })

      const text = await upstreamResp.text().catch(() => "")
      const latencyMs = Date.now() - requestStart
      console.info(`[analyze] upstream status=${upstreamResp.status} latency=${latencyMs}ms`)

      // Pass through upstream status + body (JSON or text).
      const contentType = upstreamResp.headers.get("content-type") || "application/json"
      return new Response(text || "{}", {
        status: upstreamResp.status,
        headers: { "Content-Type": contentType },
      })
    }

    const result = await analyzeSymptoms(symptoms, { age, sex, duration })
    const latencyMs = Date.now() - requestStart
    console.info(`[analyze] ok latency=${latencyMs}ms`)
    return Response.json(result)
  } catch (err: unknown) {
    const latencyMs = Date.now() - requestStart
    const message = err instanceof Error ? err.message : String(err)
    console.warn(`[analyze] error latency=${latencyMs}ms message=${message}`)

    const mapped = mapErrorToHttp(err)
    return Response.json(mapped.payload, { status: mapped.statusCode })
  }
}
