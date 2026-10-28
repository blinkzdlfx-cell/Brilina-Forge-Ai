import { createClient } from "redis"

let client: ReturnType<typeof createClient> | null = null
let connecting: Promise<ReturnType<typeof createClient>> | null = null

/**
 * Create a Redis client that works with Layerbase's TLS-routed Redis endpoint.
 * Layerbase requires the database hostname as TLS SNI; node-redis does not
 * infer this correctly from a rediss:// URL on its own.
 */
export function createRedisClient() {
  const url = process.env.REDIS_URL
  if (!url) throw new Error("REDIS_URL is not configured")

  const parsed = new URL(url)
  return createClient({
    url,
    ...(parsed.protocol === "rediss:"
      ? { socket: { tls: true, servername: parsed.hostname } }
      : {}),
  })
}

export async function getRedisClient() {
  if (!process.env.REDIS_URL) return null

  if (!client) {
    client = createRedisClient()
    client.on("error", (error) => {
      // Never log connection URLs or credentials.
      console.error("[forge-redis]", error instanceof Error ? error.name : "RedisError")
    })
  }

  if (!client.isOpen) {
    connecting ??= client.connect().then(() => client as ReturnType<typeof createClient>).finally(() => {
      connecting = null
    })
    await connecting
  }

  return client
}
