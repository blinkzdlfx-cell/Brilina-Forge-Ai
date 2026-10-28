import { after } from "next/server"
import { createResumableStreamContext } from "resumable-stream"

let context: ReturnType<typeof createResumableStreamContext> | null = null

export function getResumableStreamContext() {
  // Keep deployments without Redis functional; resume is enabled once REDIS_URL
  // is configured on the Node.js/Vercel runtime.
  if (!process.env.REDIS_URL) return null
  try {
    context ??= createResumableStreamContext({ waitUntil: after })
    return context
  } catch {
    return null
  }
}
