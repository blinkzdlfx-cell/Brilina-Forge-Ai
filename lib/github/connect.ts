import { githubWithHeaders, GithubError } from "./api"
import { normalizeRepo } from "./operations.mjs"

export type VerifiedToken = {
  login: string
  githubUserId: number | null
  scopes: string
}

// Accepts classic tokens, fine-grained tokens, and OAuth access tokens.
const TOKEN_PATTERN = /^(gh[pousr]_[A-Za-z0-9_]{20,255}|github_pat_[A-Za-z0-9_]{20,255})$/

export function looksLikeGithubToken(token: string) {
  return TOKEN_PATTERN.test(token)
}

export async function verifyToken(token: string): Promise<VerifiedToken> {
  const { data, headers } = await githubWithHeaders<{ login?: string; id?: number }>(token, "/user", {
    timeoutMs: 10_000,
  })
  if (!data?.login) throw new GithubError(502, "GitHub did not return an account for this token.")
  // Fine-grained tokens do not send x-oauth-scopes; label them explicitly.
  const scopes = headers.get("x-oauth-scopes")
  return {
    login: data.login,
    githubUserId: typeof data.id === "number" ? data.id : null,
    scopes: scopes === null ? "fine-grained" : scopes || "none",
  }
}

export type RepoSummary = {
  full_name: string
  private: boolean
  default_branch: string
  pushed_at: string | null
  can_push: boolean
}

type RawRepo = {
  full_name?: string
  private?: boolean
  default_branch?: string
  pushed_at?: string | null
  archived?: boolean
  permissions?: { push?: boolean }
}

function toSummary(repo: RawRepo): RepoSummary | null {
  const fullName = normalizeRepo(repo.full_name)
  if (!fullName) return null
  return {
    full_name: fullName,
    private: Boolean(repo.private),
    default_branch: repo.default_branch || "main",
    pushed_at: repo.pushed_at ?? null,
    can_push: Boolean(repo.permissions?.push) && !repo.archived,
  }
}

export async function listAccessibleRepos(token: string, page: number): Promise<{ repos: RepoSummary[]; hasMore: boolean }> {
  const { data, headers } = await githubWithHeaders<RawRepo[]>(
    token,
    `/user/repos?per_page=100&page=${page}&sort=pushed&affiliation=owner,collaborator,organization_member`
  )
  const repos = (Array.isArray(data) ? data : []).map(toSummary).filter((repo): repo is RepoSummary => repo !== null)
  return { repos, hasMore: /rel="next"/.test(headers.get("link") ?? "") }
}

export async function getWritableRepo(token: string, fullName: string): Promise<RepoSummary> {
  const name = normalizeRepo(fullName)
  if (!name) throw new GithubError(400, `"${fullName}" is not a valid owner/name repository.`)
  const { data } = await githubWithHeaders<RawRepo>(token, `/repos/${name}`, { timeoutMs: 10_000 })
  const summary = toSummary(data)
  if (!summary) throw new GithubError(502, "GitHub returned an unexpected repository.")
  if (!summary.can_push) {
    throw new GithubError(403, `${summary.full_name} is read-only or archived for this token, so the agent could not commit to it.`)
  }
  return summary
}
