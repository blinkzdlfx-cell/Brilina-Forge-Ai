import { after } from "next/server"
import { createResumableStreamContext } from "resumable-stream"

import { createRedisClient } from "@/lib/redis-client"

let context: ReturnType<typeof createResumableStreamContext> | null = null

export function getResumableStreamContext() {
  // Keep deployments without Redis functional; resume is enabled once REDIS_URL
  // is configured on the Node.js/Vercel runtime.
  if (!process.env.REDIS_URL) return null
  try {
    context ??= createResumableStreamContext({
      waitUntil: after,
      // Layerbase requires explicit TLS SNI. Supply configured node-redis
      // clients instead of allowing resumable-stream to create bare clients.
      publisher: createRedisClient(),
      subscriber: createRedisClient(),
    })
    return context
  } catch {
    return null
  }
}
