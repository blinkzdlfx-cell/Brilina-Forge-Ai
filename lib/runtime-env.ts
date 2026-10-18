import { getCloudflareContext } from "@opennextjs/cloudflare"

/**
 * Read a server-side setting from Cloudflare bindings when running in Workers,
 * with process.env as the local-development fallback.
 */
export function getRuntimeEnv(name: string): string | undefined {
  try {
    const env = getCloudflareContext().env as Record<string, unknown>
    const value = env[name]
    if (typeof value === "string" && value.length > 0) return value
  } catch {
    // There is no Cloudflare request context during ordinary Next.js development.
  }

  const value = process.env[name]
  return value && value.length > 0 ? value : undefined
}
