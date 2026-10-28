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
  if (parsed.protocol === "rediss:") {
    return createClient({
      username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
      password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
      database: parsed.pathname.length > 1 ? Number(parsed.pathname.slice(1)) : undefined,
      socket: {
        host: parsed.hostname,
        port: Number(parsed.port || 6379),
        tls: true,
        servername: parsed.hostname,
      },
    })
  }

  return createClient({ url })
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
