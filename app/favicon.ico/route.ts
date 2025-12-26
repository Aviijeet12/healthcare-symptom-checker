export async function GET(): Promise<Response> {
  // Avoid noisy 404s in the console when no favicon is provided.
  // Some runtimes reject 204 for Response construction; return an empty 200 instead.
  return new Response(new Uint8Array(), {
    status: 200,
    headers: {
      "Content-Type": "image/x-icon",
      "Cache-Control": "public, max-age=86400, immutable",
    },
  })
}
