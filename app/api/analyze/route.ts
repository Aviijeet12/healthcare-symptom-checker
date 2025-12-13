export async function POST(request: Request) {
  try {
    const body = await request.json()
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "https://healthcare-symptom-checker-backend-xktt.onrender.com/analyze"

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

      if (!response.ok) {
        throw new Error(`Backend error: ${response.status}`)
      }

      const data = await response.json()
      return Response.json(data)
    } catch (fetchError: any) {
      clearTimeout(timeoutId)

      // If backend is unreachable, provide helpful error with mock data option
      if (fetchError.name === "AbortError") {
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

      console.error("[v0] Fetch error:", fetchError.message)

      // Return a more helpful error message
      return Response.json(
        {
          error: "Unable to connect to the analysis service. Please ensure the backend is running and accessible.",
          code: "CONNECTION_ERROR",
          details: fetchError.message,
        },
        { status: 503 },
      )
    }
  } catch (error: any) {
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
