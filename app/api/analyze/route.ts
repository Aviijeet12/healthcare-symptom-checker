export async function POST(request: Request) {
  try {
    const body = await request.json()
    const rawBackendUrl =
      process.env.BACKEND_ANALYZE_URL ??
      process.env.NEXT_PUBLIC_BACKEND_URL ??
      (process.env.NODE_ENV === "production" ? null : "http://localhost:10000/analyze")

    if (!rawBackendUrl) {
      return Response.json(
        {
          error:
            "Backend URL is not configured. Set BACKEND_ANALYZE_URL (recommended) or NEXT_PUBLIC_BACKEND_URL to your backend /analyze endpoint.",
          code: "MISSING_BACKEND_URL",
        },
        { status: 500 },
      )
    }

    const backendUrl = normalizeAnalyzeUrl(rawBackendUrl)

    console.log("[v0] Attempting to fetch from:", backendUrl)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 20000) // 20 second timeout to avoid premature 504s

    try {
      const response = await fetch(backendUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      const contentType = response.headers.get("content-type") || ""
      const isJson = contentType.includes("application/json")
      const responseBody = isJson ? await response.json().catch(() => null) : await response.text().catch(() => "")

      if (!response.ok) {
        return Response.json(
          {
            error: "Backend returned an error.",
            code: "BACKEND_ERROR",
            status: response.status,
            details: responseBody,
          },
          { status: response.status },
        )
      }

      return Response.json(responseBody)
    } catch (fetchError: unknown) {
      clearTimeout(timeoutId)

      const errorName = fetchError instanceof Error ? fetchError.name : undefined
      const errorMessage = fetchError instanceof Error ? fetchError.message : String(fetchError)

      // If backend is unreachable, provide helpful error with mock data option
      if (errorName === "AbortError") {
        console.error("[v0] Request timeout")
        return Response.json(
          {
            error:
              "Backend service is taking too long to respond. Please check your internet connection or try again later.",
            code: "TIMEOUT",
          },
          { status: 504 },
        )
      }

      console.error("[v0] Fetch error:", errorMessage)

      // Return a more helpful error message
      return Response.json(
        {
          error: "Unable to connect to the analysis service. Please ensure the backend is running and accessible.",
          code: "CONNECTION_ERROR",
          details: errorMessage,
        },
        { status: 503 },
      )
    }
  } catch (error: unknown) {
    console.error("[v0] API Error:", error)
    return Response.json(
      {
        error: "Failed to process your request. Please try again.",
        code: "PROCESSING_ERROR",
      },
      { status: 500 },
    )
  }
}

function normalizeAnalyzeUrl(value: string): string {
  try {
    const url = new URL(value)
    if (url.pathname === "" || url.pathname === "/") {
      url.pathname = "/analyze"
      return url.toString()
    }

    if (url.pathname.endsWith("/analyze")) {
      return url.toString()
    }

    url.pathname = url.pathname.endsWith("/") ? `${url.pathname}analyze` : `${url.pathname}/analyze`
    return url.toString()
  } catch {
    // If it's not a full URL, leave it unchanged and let fetch fail with a useful error.
    return value
  }
}
