export async function GET(): Promise<Response> {
  // Avoid noisy 404s in the console when no favicon is provided.
  // Returning 204 is acceptable for browsers and keeps the request fast.
  return new Response(null, {
    status: 204,
    headers: {
      "Cache-Control": "public, max-age=86400, immutable",
    },
  })
}
