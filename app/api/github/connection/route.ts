import { requireUser } from "@/lib/auth/require-user"
import { checkRateLimit } from "@/lib/auth/rate-limit"
import { GithubError } from "@/lib/github/api"
import { looksLikeGithubToken, verifyToken } from "@/lib/github/connect"
import {
  forbiddenOrigin,
  githubErrorResponse,
  isSameOrigin,
  oauthConfig,
  readJsonWithinLimit,
} from "@/lib/github/route-helpers"
import { deleteConnection, getConnectionSummary, listAllowedRepos, saveConnection } from "@/lib/github/store"
import { getRuntimeEnv } from "@/lib/runtime-env"

export const dynamic = "force-dynamic"

export async function GET() {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  try {
    const connection = await getConnectionSummary(auth.user.id)
    const repos = connection ? await listAllowedRepos(auth.user.id) : []
    return Response.json({
      connected: Boolean(connection),
      login: connection?.github_login ?? null,
      authKind: connection?.auth_kind ?? null,
      scopes: connection?.scopes ?? null,
      repos,
      oauthAvailable: Boolean(oauthConfig(getRuntimeEnv)),
      workflowEditsEnabled: getRuntimeEnv("GITHUB_AGENT_ALLOW_WORKFLOW_EDITS") === "true",
    })
  } catch {
    return Response.json({ error: "GitHub plugin storage is unavailable. Apply the latest Supabase migration and check SUPABASE_SERVICE_ROLE_KEY." }, { status: 503 })
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return forbiddenOrigin()
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const limit = checkRateLimit(`github-connect:${auth.user.id}`, 10, 60_000)
  if (!limit.allowed) {
    return Response.json({ error: "Too many attempts. Wait a minute and try again." }, { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } })
  }

  let body: { token?: unknown }
  try {
    body = await readJsonWithinLimit<{ token?: unknown }>(request)
  } catch {
    return Response.json({ error: "Invalid or oversized request." }, { status: 400 })
  }
  const token = typeof body.token === "string" ? body.token.trim() : ""
  if (!looksLikeGithubToken(token)) {
    return Response.json({ error: "That does not look like a GitHub token. Fine-grained tokens start with github_pat_, classic tokens with ghp_." }, { status: 400 })
  }

  try {
    const verified = await verifyToken(token)
    await saveConnection({
      userId: auth.user.id,
      token,
      login: verified.login,
      githubUserId: verified.githubUserId,
      authKind: "pat",
      scopes: verified.scopes,
    })
    return Response.json({ connected: true, login: verified.login, authKind: "pat", scopes: verified.scopes })
  } catch (error) {
    if (error instanceof GithubError) return githubErrorResponse(error, "Could not verify the token.")
    return Response.json({ error: "Could not save the GitHub connection." }, { status: 503 })
  }
}

export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) return forbiddenOrigin()
  const auth = await requireUser()
  if (!auth.ok) return auth.response
  try {
    await deleteConnection(auth.user.id)
    return Response.json({ connected: false })
  } catch {
    return Response.json({ error: "Could not disconnect GitHub." }, { status: 503 })
  }
}
