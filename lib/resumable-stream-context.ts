import { after } from "next/server"
import { createResumableStreamContext } from "resumable-stream"

import { createRedisClient } from "@/lib/redis-client"

type ResumableContext = ReturnType<typeof createResumableStreamContext>

let context: ResumableContext | null = null
let contextPromise: Promise<ResumableContext | null> | null = null

export function getResumableStreamContext(): Promise<ResumableContext | null> {
  if (!process.env.REDIS_URL) return Promise.resolve(null)
  if (context) return Promise.resolve(context)

  contextPromise ??= (async () => {
    let publisher: ReturnType<typeof createRedisClient> | null = null
    let subscriber: ReturnType<typeof createRedisClient> | null = null
    try {
      // Layerbase routes its shared TLS port by SNI. Explicitly configured
      // clients are connected here because resumable-stream does not connect
      // custom publisher/subscriber instances for us.
      publisher = createRedisClient()
      subscriber = createRedisClient()
      const logRedisError = (error: unknown) => {
        // Never log connection URLs or credentials.
        console.error("[forge-redis]", error instanceof Error ? error.name : "RedisError")
      }
      publisher.on("error", logRedisError)
      subscriber.on("error", logRedisError)
      await Promise.all([publisher.connect(), subscriber.connect()])
      context = createResumableStreamContext({ waitUntil: after, publisher, subscriber })
      return context
    } catch (error) {
      // Log only the error class; never expose Redis URLs, usernames, or secrets.
      console.error("[forge-redis] context_init_failed", error instanceof Error ? error.name : "UnknownError")
      await Promise.allSettled([
        publisher?.isOpen ? publisher.quit() : Promise.resolve(),
        subscriber?.isOpen ? subscriber.quit() : Promise.resolve(),
      ])
      return null
    } finally {
      if (!context) contextPromise = null
    }
  })()

  return contextPromise
}
