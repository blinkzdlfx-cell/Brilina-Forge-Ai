type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()

/**
 * Best-effort per-isolate limiter for sensitive endpoints. Cloudflare's
 * isolate-local memory is not a distributed rate limiter; provider/dashboard
 * limits remain necessary for stronger enforcement.
 */
export function checkRateLimit(key: string, limit: number, windowMs: number, now = Date.now()) {
  let bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs }
    buckets.set(key, bucket)
  }

  if (buckets.size > 2000) {
    for (const [bucketKey, value] of buckets) {
      if (value.resetAt <= now) buckets.delete(bucketKey)
    }
  }

  if (bucket.count >= limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    }
  }

  bucket.count += 1
  return { allowed: true, retryAfterSeconds: 0 }
}
