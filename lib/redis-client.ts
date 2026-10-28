import { createClient } from "redis"

let client: ReturnType<typeof createClient> | null = null
let connecting: Promise<ReturnType<typeof createClient>> | null = null

export async function getRedisClient() {
  const url = process.env.REDIS_URL
  if (!url) return null

  if (!client) {
    client = createClient({ url })
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
