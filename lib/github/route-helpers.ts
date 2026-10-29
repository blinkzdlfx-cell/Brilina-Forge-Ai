import { GithubError } from "./api"

export const MAX_ALLOWED_REPOS = 50
export const MAX_GITHUB_SETTINGS_BODY = 16 * 1024

export async function readJsonWithinLimit<T>(request: Request, maxBytes = MAX_GITHUB_SETTINGS_BODY): Promise<T> {
  const declared = Number(request.headers.get("content-length"))
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error("body_too_large")
  if (!request.body) throw new Error("invalid_body")
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maxBytes) {
      await reader.cancel()
      throw new Error("body_too_large")
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return JSON.parse(new TextDecoder().decode(bytes)) as T
}

// State-changing plugin routes are cookie-authenticated, so reject cross-site
// browser requests even though Supabase cookies are SameSite=Lax.
export function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin")
  if (!origin) return true // non-browser clients and same-origin GETs omit it
  try {
    const originHost = new URL(origin).host
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host
    return originHost === host
  } catch {
    return false
  }
}

export function forbiddenOrigin() {
  return Response.json({ error: "cross_origin_request_blocked" }, { status: 403 })
}

export function githubErrorResponse(error: unknown, fallback: string) {
  if (error instanceof GithubError) {
    // GitHub's own 401 means the token is bad; do not surface it as our 401,
    // which the app treats as "signed out".
    const status = error.status === 401 ? 400 : error.status >= 500 ? 502 : error.status
    return Response.json({ error: error.message }, { status })
  }
  return Response.json({ error: fallback }, { status: 500 })
}

export function oauthConfig(getEnv: (name: string) => string | undefined) {
  const clientId = getEnv("GITHUB_OAUTH_CLIENT_ID")
  const clientSecret = getEnv("GITHUB_OAUTH_CLIENT_SECRET")
  return clientId && clientSecret ? { clientId, clientSecret } : null
}
