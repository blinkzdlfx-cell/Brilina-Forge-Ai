import { requireUser } from "@/lib/auth/require-user"
import { checkRateLimit } from "@/lib/auth/rate-limit"
import { getWritableRepo, listAccessibleRepos } from "@/lib/github/connect"
import { normalizeRepo } from "@/lib/github/operations.mjs"
import { forbiddenOrigin, githubErrorResponse, isSameOrigin, MAX_ALLOWED_REPOS, readJsonWithinLimit } from "@/lib/github/route-helpers"
import { addAllowedRepos, getGithubToken, listAllowedRepos, removeAllowedRepos } from "@/lib/github/store"

export const dynamic = "force-dynamic"

async function requireToken(userId: string) {
  const token = await getGithubToken(userId)
  if (!token) {
    return { token: null, response: Response.json({ error: "GitHub is not connected, or the stored token can no longer be read. Reconnect GitHub." }, { status: 409 }) }
  }
  return { token, response: null }
}

// GET            -> repositories the agent may use
// GET ?available -> repositories the connected account can access (paged), so
//                   the user can choose which ones to allow
export async function GET(request: Request) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  try {
    const allowed = await listAllowedRepos(auth.user.id)
    if (!url.searchParams.has("available")) return Response.json({ repos: allowed })

    const limit = checkRateLimit(`github-repos:${auth.user.id}`, 30, 60_000)
    if (!limit.allowed) return Response.json({ error: "Too many requests. Try again shortly." }, { status: 429 })

    const { token, response } = await requireToken(auth.user.id)
    if (!token) return response
    const page = Math.min(Math.max(Number(url.searchParams.get("page")) || 1, 1), 20)
    const available = await listAccessibleRepos(token, page)
    const allowedNames = new Set(allowed.map((repo) => repo.full_name.toLowerCase()))
    return Response.json({
      repos: available.repos.map((repo) => ({ ...repo, allowed: allowedNames.has(repo.full_name.toLowerCase()) })),
      hasMore: available.hasMore,
      page,
    })
  } catch (error) {
    return githubErrorResponse(error, "Could not load repositories.")
  }
}

// PUT { add?: string[], remove?: string[] }
export async function PUT(request: Request) {
  if (!isSameOrigin(request)) return forbiddenOrigin()
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const limit = checkRateLimit(`github-repo-write:${auth.user.id}`, 20, 60_000)
  if (!limit.allowed) return Response.json({ error: "Too many requests. Try again shortly." }, { status: 429 })

  let body: { add?: unknown; remove?: unknown }
  try {
    body = await readJsonWithinLimit<{ add?: unknown; remove?: unknown }>(request)
  } catch {
    return Response.json({ error: "Invalid or oversized request." }, { status: 400 })
  }

  const clean = (value: unknown) =>
    Array.isArray(value)
      ? [...new Set(value.map(normalizeRepo).filter((name): name is string => name !== null))].slice(0, 25)
      : []
  const add = clean(body.add)
  const remove = clean(body.remove)
  if ((Array.isArray(body.add) && body.add.length > 25) || (Array.isArray(body.remove) && body.remove.length > 25)) {
    return Response.json({ error: "You can add or remove at most 25 repositories per request." }, { status: 400 })
  }

  try {
    const existing = await listAllowedRepos(auth.user.id)
    const existingNames = new Set(existing.map((repo) => repo.full_name.toLowerCase()))
    const toAdd = add.filter((name) => !existingNames.has(name.toLowerCase()))
    const removedNames = new Set(remove.map((name) => name.toLowerCase()))
    const remainingCount = existing.filter((repo) => !removedNames.has(repo.full_name.toLowerCase())).length
    if (remainingCount + toAdd.length > MAX_ALLOWED_REPOS) {
      return Response.json({ error: `You can allow at most ${MAX_ALLOWED_REPOS} repositories.` }, { status: 400 })
    }

    const rejected: Array<{ repo: string; reason: string }> = []
    if (toAdd.length) {
      const { token, response } = await requireToken(auth.user.id)
      if (!token) return response
      // Re-check each repository with the user's own token so the allowlist can
      // never contain something the account cannot actually write to.
      const checked = await Promise.all(
        toAdd.map(async (name) => {
          try {
            const repo = await getWritableRepo(token, name)
            return { ok: true as const, repo }
          } catch (error) {
            return { ok: false as const, name, reason: error instanceof Error ? error.message : "Could not verify access." }
          }
        })
      )
      const accepted = []
      for (const result of checked) {
        if (result.ok) accepted.push({ full_name: result.repo.full_name, default_branch: result.repo.default_branch })
        else rejected.push({ repo: result.name, reason: result.reason })
      }
      await addAllowedRepos(auth.user.id, accepted)
    }
    if (remove.length) await removeAllowedRepos(auth.user.id, existing.filter((repo) => remove.some((name) => name.toLowerCase() === repo.full_name.toLowerCase())).map((repo) => repo.full_name))

    return Response.json({ repos: await listAllowedRepos(auth.user.id), rejected })
  } catch (error) {
    return githubErrorResponse(error, "Could not update repository access.")
  }
}
