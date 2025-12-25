import { createClient } from "redis"

type RedisClient = ReturnType<typeof createClient>

declare global {
  // eslint-disable-next-line no-var
  var __symptomCheckerRedisClient: RedisClient | undefined
  // eslint-disable-next-line no-var
  var __symptomCheckerRedisClientPromise: Promise<RedisClient | null> | undefined
}

function getRedisUrl(): string {
  return (process.env.REDIS_URL ?? "").trim()
}

function normalizeAndValidateRedisUrl(raw: string): string | null {
  const trimmed = (raw ?? "").trim()
  if (!trimmed) return null

  // Allow users to set host:port without scheme.
  const withScheme = trimmed.includes("://") ? trimmed : `redis://${trimmed}`

  try {
    const parsed = new URL(withScheme)
    const protocol = parsed.protocol.toLowerCase()
    if (protocol !== "redis:" && protocol !== "rediss:") return null
    if (!parsed.hostname) return null
    return withScheme
  } catch {
    return null
  }
}

export async function getRedisClient(): Promise<RedisClient | null> {
  const rawUrl = getRedisUrl()
  const url = normalizeAndValidateRedisUrl(rawUrl)
  if (!url) {
    if (rawUrl) {
      console.warn("[redis] invalid_url; caching disabled")
    }
    return null
  }

  if (globalThis.__symptomCheckerRedisClient) {
    return globalThis.__symptomCheckerRedisClient
  }

  if (!globalThis.__symptomCheckerRedisClientPromise) {
    globalThis.__symptomCheckerRedisClientPromise = (async () => {
      let client: RedisClient
      try {
        client = createClient({ url })
      } catch (err) {
        console.warn(`[redis] create_client_failed ${err instanceof Error ? err.message : String(err)}`)
        return null
      }

      client.on("error", (err) => {
        // Avoid logging request payloads; log only the error message.
        console.warn(`[redis] error ${err instanceof Error ? err.message : String(err)}`)
      })

      try {
        if (!client.isOpen) {
          await client.connect()
        }
        globalThis.__symptomCheckerRedisClient = client
        return client
      } catch (err) {
        console.warn(`[redis] connect_failed ${err instanceof Error ? err.message : String(err)}`)
        try {
          await client.quit()
        } catch {
          // ignore
        }
        return null
      }
    })()
  }

  return globalThis.__symptomCheckerRedisClientPromise
}

export async function redisGetJson<T>(key: string): Promise<T | null> {
  const client = await getRedisClient()
  if (!client) return null

  try {
    const value = await client.get(key)
    if (!value) return null
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

export async function redisSetJson(
  key: string,
  value: unknown,
  opts: { ttlSeconds?: number } = {},
): Promise<boolean> {
  const client = await getRedisClient()
  if (!client) return false

  try {
    const payload = JSON.stringify(value)
    if (typeof opts.ttlSeconds === "number" && Number.isFinite(opts.ttlSeconds) && opts.ttlSeconds > 0) {
      await client.set(key, payload, { EX: Math.floor(opts.ttlSeconds) })
    } else {
      await client.set(key, payload)
    }
    return true
  } catch {
    return false
  }
}
