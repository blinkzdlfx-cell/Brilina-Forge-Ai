// GitHub coding-agent operations.
//
// Everything here is written against an injected `request(path, options)`
// function so the policy can be unit-tested with a fake GitHub API and so the
// token never leaves the server-side wrapper that created `request`.
//
// Safety model (enforced in code, not only in the prompt):
//   * Only repositories on the user's allowlist can be touched.
//   * Writes (branches, commits, PRs) only happen on `forge/*` branches.
//   * The agent never merges PRs or dispatches workflows; the owner reviews
//     and merges manually.
//   * Every request has a hard cap on GitHub API calls.

export const BRANCH_PREFIX = "forge/"

export const LIMITS = Object.freeze({
  maxCallsPerRequest: 120,
  maxFilesPerCommit: 30,
  maxCharsPerFile: 200_000,
  maxCharsPerCommit: 600_000,
  maxReadChars: 14_000,
  maxTreeEntries: 300,
  maxSearchResults: 15,
  maxLogChars: 5_000,
  maxEditableFileBytes: 1_000_000,
})

export class PolicyError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message)
    this.name = "PolicyError"
  }
}

const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
const BRANCH_PATTERN = /^[A-Za-z0-9._\/-]+$/

/** @param {unknown} input */
export function normalizeRepo(input) {
  if (typeof input !== "string") return null
  const trimmed = input
    .trim()
    .replace(/^https?:\/\/github\.com\//i, "")
    .replace(/\.git$/i, "")
    .replace(/\/+$/, "")
  if (!REPO_PATTERN.test(trimmed)) return null
  // "." and ".." match the character class but are path traversal, not names.
  return trimmed.split("/").some((part) => part === "." || part === "..") ? null : trimmed
}

/** @param {unknown} name */
export function isAgentBranch(name) {
  return typeof name === "string" && validateAgentBranch(name) === null
}

/**
 * Returns an error message, or null when the branch name is acceptable.
 * @param {string} name
 */
export function validateAgentBranch(name) {
  if (!name.startsWith(BRANCH_PREFIX)) {
    return `Branch names must start with "${BRANCH_PREFIX}" (for example "${BRANCH_PREFIX}fix-login"). The agent never writes to other branches.`
  }
  if (name.length > 100) return "Branch names must be 100 characters or fewer."
  if (!BRANCH_PATTERN.test(name)) return "Branch names may only use letters, numbers, dots, dashes, underscores and slashes."
  if (name.includes("..") || name.includes("//") || name.endsWith("/") || name.endsWith(".") || name.endsWith(".lock")) {
    return "That branch name is not a valid Git ref."
  }
  if (name.slice(BRANCH_PREFIX.length).length === 0) return "Add a short description after the branch prefix."
  return null
}

/**
 * @param {string} path
 * @param {{ allowWorkflowEdits?: boolean }} [options]
 * @returns {string | null} an error message, or null when valid
 */
export function validateRepoPath(path, options = {}) {
  if (typeof path !== "string" || path.length === 0) return "A file path is required."
  if (path.length > 300) return "File paths must be 300 characters or fewer."
  if (path.startsWith("/") || path.includes("\\") || path.includes("\0")) return `Invalid path "${path}". Use a repository-relative path with forward slashes.`
  const segments = path.split("/")
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    return `Invalid path "${path}".`
  }
  if (segments.some((segment) => segment.toLowerCase() === ".git")) return `Paths inside .git are not allowed ("${path}").`
  if (!options.allowWorkflowEdits && /^\.github\/workflows\//i.test(path)) {
    return `Editing ${path} is disabled. Workflow files can run code with repository secrets, so the owner must enable GITHUB_AGENT_ALLOW_WORKFLOW_EDITS first.`
  }
  return null
}

/**
 * @param {string} text
 * @param {number} max
 */
export function clipText(text, max) {
  if (text.length <= max) return text
  return `${text.slice(0, max)}\n…[truncated ${text.length - max} characters]`
}

/**
 * Apply exact-match replacements. Each `oldText` must occur exactly once so an
 * edit can never silently hit the wrong place.
 * @param {string} source
 * @param {Array<{ oldText: string, newText: string }>} edits
 * @returns {{ ok: true, text: string } | { ok: false, error: string }}
 */
export function applyEdits(source, edits) {
  let text = source
  for (let index = 0; index < edits.length; index++) {
    const { oldText, newText } = edits[index]
    if (!oldText) return { ok: false, error: `Edit ${index + 1}: old_text must not be empty.` }
    const first = text.indexOf(oldText)
    if (first === -1) {
      return { ok: false, error: `Edit ${index + 1}: old_text was not found. Re-read the file and copy the exact text, including whitespace.` }
    }
    if (text.indexOf(oldText, first + oldText.length) !== -1) {
      return { ok: false, error: `Edit ${index + 1}: old_text matches more than once. Include more surrounding lines so it is unique.` }
    }
    text = text.slice(0, first) + newText + text.slice(first + oldText.length)
  }
  return { ok: true, text }
}

/**
 * Combine check runs and legacy commit statuses into one verdict.
 * @param {Array<{ name?: string, status?: string, conclusion?: string | null }>} checkRuns
 * @param {{ state?: string, total_count?: number, statuses?: Array<{ context?: string, state?: string }> } | null} combinedStatus
 * @returns {{ state: "none" | "pending" | "success" | "failure", failing: string[], pending: string[] }}
 */
export function summarizeChecks(checkRuns, combinedStatus) {
  const failing = []
  const pending = []
  let seen = 0

  for (const run of checkRuns ?? []) {
    seen += 1
    const name = run.name ?? "check"
    if (run.status !== "completed") pending.push(name)
    else if (["failure", "cancelled", "timed_out", "action_required", "startup_failure"].includes(run.conclusion ?? "")) failing.push(name)
  }

  if (combinedStatus && (combinedStatus.total_count ?? 0) > 0) {
    for (const status of combinedStatus.statuses ?? []) {
      seen += 1
      const name = status.context ?? "status"
      if (status.state === "pending") pending.push(name)
      else if (status.state === "failure" || status.state === "error") failing.push(name)
    }
  }

  if (seen === 0) return { state: "none", failing, pending }
  if (failing.length) return { state: "failure", failing, pending }
  if (pending.length) return { state: "pending", failing, pending }
  return { state: "success", failing, pending }
}

/**
 * Keep the part of a CI log that explains the failure.
 * @param {string} log
 * @param {number} [maxChars]
 */
export function extractErrorContext(log, maxChars = LIMITS.maxLogChars) {
  const clean = log
    .replace(/\u001b\[[0-9;]*m/g, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s?/, ""))
  const firstError = clean.findIndex((line) => line.includes("##[error]"))
  const slice = firstError >= 0
    ? clean.slice(Math.max(0, firstError - 40), firstError + 12)
    : clean.slice(-60)
  const text = slice.join("\n").trim()
  return text.length <= maxChars ? text : `…${text.slice(text.length - maxChars)}`
}

/** @param {string} path */
export function encodePath(path) {
  return path.split("/").map(encodeURIComponent).join("/")
}

/** @param {string} value */
function decodeBase64Utf8(value) {
  const binary = atob(value.replace(/\s/g, ""))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

const short = (/** @type {string} */ sha) => String(sha).slice(0, 7)

/**
 * @typedef {{ ok: boolean, summary: string, content?: string, url?: string }} ToolResult
 */

/**
 * @param {{
 *   request: (path: string, options?: Record<string, unknown>) => Promise<any>,
 *   repos: Array<{ full_name: string, default_branch: string }>,
 *   allowWorkflowEdits?: boolean,
 *   maxCalls?: number,
 * }} config
 */
export function createGithubOperations(config) {
  const { request, repos } = config
  const allowWorkflowEdits = Boolean(config.allowWorkflowEdits)
  const maxCalls = config.maxCalls ?? LIMITS.maxCallsPerRequest
  let calls = 0

  /**
   * @param {string} path
   * @param {Record<string, unknown>} [options]
   */
  async function call(path, options) {
    calls += 1
    if (calls > maxCalls) {
      throw new PolicyError("This request already made the maximum number of GitHub calls. Summarize progress and let the user continue in a new message.")
    }
    return request(path, options)
  }

  /** @param {unknown} input */
  function resolveRepo(input) {
    const normalized = normalizeRepo(input)
    const match = normalized
      ? repos.find((repo) => repo.full_name.toLowerCase() === normalized.toLowerCase())
      : undefined
    if (!match) {
      const list = repos.map((repo) => repo.full_name).join(", ") || "none"
      throw new PolicyError(`Repository "${String(input)}" is not on the allowed list (allowed: ${list}). Ask the user to add it in Settings → Plugins → GitHub.`)
    }
    return match
  }

  /**
   * @param {() => Promise<ToolResult>} work
   * @returns {Promise<ToolResult>}
   */
  async function guarded(work) {
    try {
      return await work()
    } catch (error) {
      if (error instanceof Error && (error.name === "PolicyError" || error.name === "GithubError")) {
        return { ok: false, summary: error.message }
      }
      if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
        return { ok: false, summary: "The GitHub request timed out. Try again." }
      }
      return { ok: false, summary: "Unexpected error while talking to GitHub." }
    }
  }

  /**
   * @param {string} repo
   * @param {string} path
   * @param {string} ref
   * @returns {Promise<{ kind: "file", text: string } | { kind: "dir", entries: Array<{ name: string, type: string, size: number }> } | { kind: "binary" } | { kind: "toolarge", size: number }>}
   */
  async function fetchContents(repo, path, ref) {
    const data = await call(`/repos/${repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`)
    if (Array.isArray(data)) {
      return { kind: "dir", entries: data.map((entry) => ({ name: String(entry.name), type: String(entry.type), size: Number(entry.size ?? 0) })) }
    }
    if (data?.type !== "file") throw new PolicyError(`"${path}" is not a regular file (type: ${String(data?.type)}).`)
    const size = Number(data.size ?? 0)
    if (size > LIMITS.maxEditableFileBytes) return { kind: "toolarge", size }
    const text = decodeBase64Utf8(String(data.content ?? ""))
    if (text.includes("\0")) return { kind: "binary" }
    return { kind: "file", text }
  }

  return {
    get callCount() {
      return calls
    },

    listRepositories() {
      return guarded(async () => ({
        ok: true,
        summary: `${repos.length} repositor${repos.length === 1 ? "y" : "ies"} available`,
        content: repos.map((repo) => `${repo.full_name} (default branch: ${repo.default_branch})`).join("\n") || "No repositories have been added yet.",
      }))
    },

    /** @param {{ repo: string, ref?: string, path?: string }} input */
    getTree(input) {
      return guarded(async () => {
        const repo = resolveRepo(input.repo)
        const ref = input.ref?.trim() || repo.default_branch
        const prefix = (input.path ?? "").replace(/^\/+|\/+$/g, "")
        if (prefix && validateRepoPath(prefix, { allowWorkflowEdits: true })) throw new PolicyError(`Invalid path "${prefix}".`)
        const commit = await call(`/repos/${repo.full_name}/commits/${encodePath(ref)}`)
        const treeSha = commit?.commit?.tree?.sha
        if (!treeSha) throw new PolicyError(`Could not resolve "${ref}".`)
        const tree = await call(`/repos/${repo.full_name}/git/trees/${treeSha}?recursive=1`)
        /** @type {Array<{ path: string, type: string, size?: number }>} */
        const entries = (tree?.tree ?? []).filter((/** @type {{ path: string, type: string }} */ entry) => entry.type === "blob" && (!prefix || entry.path === prefix || entry.path.startsWith(`${prefix}/`)))
        const shown = entries.slice(0, LIMITS.maxTreeEntries)
        const lines = shown.map((entry) => `${entry.path}${typeof entry.size === "number" ? ` (${entry.size}b)` : ""}`)
        if (entries.length > shown.length) lines.push(`…${entries.length - shown.length} more files. Pass a deeper "path" to narrow the listing.`)
        if (tree?.truncated) lines.push("(GitHub truncated this tree because the repository is very large.)")
        return {
          ok: true,
          summary: `${entries.length} file${entries.length === 1 ? "" : "s"} in ${repo.full_name}@${ref}${prefix ? `/${prefix}` : ""}`,
          content: lines.join("\n") || "No files matched.",
        }
      })
    },

    /** @param {{ repo: string, path: string, ref?: string, startLine?: number, endLine?: number }} input */
    readFile(input) {
      return guarded(async () => {
        const repo = resolveRepo(input.repo)
        const pathError = validateRepoPath(input.path, { allowWorkflowEdits: true })
        if (pathError) throw new PolicyError(pathError)
        const ref = input.ref?.trim() || repo.default_branch
        const result = await fetchContents(repo.full_name, input.path, ref)
        if (result.kind === "dir") {
          return {
            ok: true,
            summary: `Directory ${input.path} (${result.entries.length} entries)`,
            content: result.entries.map((entry) => `${entry.type === "dir" ? "[dir] " : ""}${entry.name}`).join("\n"),
          }
        }
        if (result.kind === "binary") return { ok: false, summary: `${input.path} is a binary file and cannot be shown as text.` }
        if (result.kind === "toolarge") return { ok: false, summary: `${input.path} is ${result.size} bytes, which is too large to read through the agent.` }

        const allLines = result.text.split("\n")
        const start = Math.max(1, Math.floor(input.startLine ?? 1))
        const end = Math.min(allLines.length, Math.floor(input.endLine ?? allLines.length))
        const ranged = start > 1 || end < allLines.length
        const body = ranged ? allLines.slice(start - 1, end).join("\n") : result.text
        return {
          ok: true,
          summary: `Read ${input.path}${ranged ? ` lines ${start}-${end}` : ""} (${allLines.length} lines)`,
          content: clipText(body, LIMITS.maxReadChars),
          url: `https://github.com/${repo.full_name}/blob/${ref}/${encodePath(input.path)}`,
        }
      })
    },

    /** @param {{ repo: string, query: string }} input */
    searchCode(input) {
      return guarded(async () => {
        const repo = resolveRepo(input.repo)
        const query = input.query.replace(/\brepo:\S+/gi, "").trim()
        if (!query) throw new PolicyError("Provide a search query.")
        const data = await call(
          `/search/code?q=${encodeURIComponent(`${query} repo:${repo.full_name}`)}&per_page=${LIMITS.maxSearchResults}`,
          { accept: "application/vnd.github.text-match+json" }
        )
        const items = Array.isArray(data?.items) ? data.items : []
        const lines = items.map((/** @type {{ path: string, text_matches?: Array<{ fragment?: string }> }} */ item) => {
          const fragment = item.text_matches?.[0]?.fragment?.replace(/\s+/g, " ").trim().slice(0, 200)
          return fragment ? `${item.path}\n  ${fragment}` : item.path
        })
        return {
          ok: true,
          summary: `${items.length} match${items.length === 1 ? "" : "es"} for "${query}" in ${repo.full_name} (default branch only)`,
          content: lines.join("\n") || "No matches. Code search indexes the default branch and can lag behind recent commits.",
        }
      })
    },

    /** @param {{ repo: string, branch: string, from?: string }} input */
    createBranch(input) {
      return guarded(async () => {
        const repo = resolveRepo(input.repo)
        const branchError = validateAgentBranch(input.branch)
        if (branchError) throw new PolicyError(branchError)
        const from = input.from?.trim() || repo.default_branch
        const base = await call(`/repos/${repo.full_name}/git/ref/heads/${encodePath(from)}`)
        const sha = base?.object?.sha
        if (!sha) throw new PolicyError(`Could not find base branch "${from}".`)
        try {
          await call(`/repos/${repo.full_name}/git/refs`, { method: "POST", body: { ref: `refs/heads/${input.branch}`, sha } })
        } catch (error) {
          if (error instanceof Error && error.name === "GithubError" && /already exists/i.test(error.message)) {
            return { ok: true, summary: `Branch ${input.branch} already exists; continue working on it.` }
          }
          throw error
        }
        return {
          ok: true,
          summary: `Created ${input.branch} from ${from} (${short(sha)})`,
          url: `https://github.com/${repo.full_name}/tree/${input.branch}`,
        }
      })
    },

    /**
     * @param {{
     *   repo: string,
     *   branch: string,
     *   message: string,
     *   changes: Array<{ path: string, content?: string, delete?: boolean, edits?: Array<{ oldText: string, newText: string }> }>
     * }} input
     */
    commitFiles(input) {
      return guarded(async () => {
        const repo = resolveRepo(input.repo)
        const branchError = validateAgentBranch(input.branch)
        if (branchError) throw new PolicyError(branchError)
        if (!input.message.trim()) throw new PolicyError("A commit message is required.")
        if (!input.changes.length) throw new PolicyError("Provide at least one change.")
        if (input.changes.length > LIMITS.maxFilesPerCommit) throw new PolicyError(`A commit can change at most ${LIMITS.maxFilesPerCommit} files. Split the work into several commits.`)

        const seen = new Set()
        let totalChars = 0
        for (const change of input.changes) {
          const pathError = validateRepoPath(change.path, { allowWorkflowEdits })
          if (pathError) throw new PolicyError(pathError)
          if (seen.has(change.path)) throw new PolicyError(`"${change.path}" appears twice in one commit.`)
          seen.add(change.path)
          const modes = [change.content !== undefined, Boolean(change.delete), Boolean(change.edits?.length)].filter(Boolean).length
          if (modes !== 1) throw new PolicyError(`"${change.path}": provide exactly one of content, edits, or delete.`)
          if (change.content !== undefined) {
            if (change.content.length > LIMITS.maxCharsPerFile) throw new PolicyError(`"${change.path}" is larger than ${LIMITS.maxCharsPerFile} characters.`)
            totalChars += change.content.length
          } else if (change.edits?.length) {
            const editChars = change.edits.reduce((sum, edit) => sum + edit.oldText.length + edit.newText.length, 0)
            if (editChars > LIMITS.maxCharsPerFile) throw new PolicyError(`Edits for "${change.path}" exceed ${LIMITS.maxCharsPerFile} characters.`)
            totalChars += editChars
          }
        }
        if (totalChars > LIMITS.maxCharsPerCommit) throw new PolicyError("This commit is too large. Split it into smaller commits.")

        const ref = await call(`/repos/${repo.full_name}/git/ref/heads/${encodePath(input.branch)}`)
        const parentSha = ref?.object?.sha
        if (!parentSha) throw new PolicyError(`Branch ${input.branch} does not exist. Create it first with the branch tool.`)
        const parent = await call(`/repos/${repo.full_name}/git/commits/${parentSha}`)
        const baseTree = parent?.tree?.sha
        if (!baseTree) throw new PolicyError("Could not read the branch tip.")

        /** @type {Array<Record<string, unknown>>} */
        const treeEntries = []
        for (const change of input.changes) {
          if (change.delete) {
            treeEntries.push({ path: change.path, mode: "100644", type: "blob", sha: null })
          } else if (change.edits?.length) {
            const current = await fetchContents(repo.full_name, change.path, input.branch)
            if (current.kind !== "file") throw new PolicyError(`"${change.path}" cannot be edited with text replacements. Send full content instead.`)
            const applied = applyEdits(current.text, change.edits)
            if (!applied.ok) throw new PolicyError(`"${change.path}": ${applied.error}`)
            if (applied.text.length > LIMITS.maxCharsPerFile) throw new PolicyError(`"${change.path}" is larger than ${LIMITS.maxCharsPerFile} characters.`)
            treeEntries.push({ path: change.path, mode: "100644", type: "blob", content: applied.text })
          } else {
            treeEntries.push({ path: change.path, mode: "100644", type: "blob", content: change.content ?? "" })
          }
        }

        const tree = await call(`/repos/${repo.full_name}/git/trees`, { method: "POST", body: { base_tree: baseTree, tree: treeEntries } })
        if (tree?.sha === baseTree) return { ok: false, summary: "These changes produce no difference from the current branch." }
        const commit = await call(`/repos/${repo.full_name}/git/commits`, {
          method: "POST",
          body: { message: input.message.trim().slice(0, 2000), tree: tree.sha, parents: [parentSha] },
        })
        // Never force-push: a concurrent change on the branch must fail loudly.
        await call(`/repos/${repo.full_name}/git/refs/heads/${encodePath(input.branch)}`, { method: "PATCH", body: { sha: commit.sha, force: false } })
        return {
          ok: true,
          summary: `Committed ${input.changes.length} file${input.changes.length === 1 ? "" : "s"} to ${input.branch} (${short(commit.sha)})`,
          content: input.changes.map((change) => `${change.delete ? "deleted" : change.edits ? "edited" : "wrote"} ${change.path}`).join("\n"),
          url: `https://github.com/${repo.full_name}/commit/${commit.sha}`,
        }
      })
    },

    /** @param {{ repo: string, head: string, title: string, body?: string, base?: string, draft?: boolean }} input */
    openPullRequest(input) {
      return guarded(async () => {
        const repo = resolveRepo(input.repo)
        const branchError = validateAgentBranch(input.head)
        if (branchError) throw new PolicyError(branchError)
        const pr = await call(`/repos/${repo.full_name}/pulls`, {
          method: "POST",
          body: {
            title: input.title.trim().slice(0, 250),
            head: input.head,
            base: input.base?.trim() || repo.default_branch,
            body: (input.body ?? "").slice(0, 20_000),
            draft: Boolean(input.draft),
          },
        })
        return { ok: true, summary: `Opened PR #${pr.number}: ${pr.title}`, url: String(pr.html_url) }
      })
    },

    /** @param {{ repo: string, number: number }} input */
    getPullRequest(input) {
      return guarded(async () => {
        const repo = resolveRepo(input.repo)
        const pr = await call(`/repos/${repo.full_name}/pulls/${input.number}`)
        const sha = pr?.head?.sha
        const [runs, status] = sha
          ? await Promise.all([
              call(`/repos/${repo.full_name}/commits/${sha}/check-runs?per_page=50`),
              call(`/repos/${repo.full_name}/commits/${sha}/status`),
            ])
          : [null, null]
        const checks = summarizeChecks(runs?.check_runs ?? [], status)
        const lines = [
          `state: ${pr.merged ? "merged" : pr.state}${pr.draft ? " (draft)" : ""}`,
          `branch: ${pr.head?.ref} → ${pr.base?.ref}`,
          `mergeable: ${pr.mergeable === null ? "unknown yet" : pr.mergeable} (${pr.mergeable_state ?? "n/a"})`,
          `ci: ${checks.state}${checks.failing.length ? ` — failing: ${checks.failing.join(", ")}` : ""}${checks.pending.length ? ` — running: ${checks.pending.join(", ")}` : ""}`,
          `changed files: ${pr.changed_files ?? "?"}, +${pr.additions ?? 0} −${pr.deletions ?? 0}`,
        ]
        return { ok: true, summary: `PR #${pr.number}: ${pr.title}`, content: lines.join("\n"), url: String(pr.html_url) }
      })
    },

    /** @param {{ repo: string, number: number, method?: "squash" | "merge" | "rebase" }} input */
    mergePullRequest(input) {
      return guarded(async () => {
        void input
        throw new PolicyError("The GitHub agent cannot merge pull requests. Ask the repository owner to review and merge it manually.")
        /* istanbul ignore next -- kept unreachable while existing integrations migrate */
        const repo = resolveRepo(input.repo)
        const pr = await call(`/repos/${repo.full_name}/pulls/${input.number}`)
        if (pr.merged) return { ok: true, summary: `PR #${pr.number} is already merged.`, url: String(pr.html_url) }
        if (pr.state !== "open") throw new PolicyError(`PR #${pr.number} is ${pr.state}.`)
        if (pr.draft) throw new PolicyError(`PR #${pr.number} is a draft. Mark it ready for review first.`)
        const headRepo = String(pr.head?.repo?.full_name ?? "").toLowerCase()
        if (headRepo !== repo.full_name.toLowerCase()) throw new PolicyError("The agent only merges pull requests from branches inside the same repository, never from forks.")
        if (!isAgentBranch(pr.head?.ref)) throw new PolicyError(`The agent only merges pull requests from "${BRANCH_PREFIX}*" branches. PR #${pr.number} comes from "${pr.head?.ref}".`)
        if (pr.mergeable === false) throw new PolicyError(`PR #${pr.number} has merge conflicts (${pr.mergeable_state}). Update the branch and resolve them first.`)

        const sha = pr.head.sha
        const [runs, status] = await Promise.all([
          call(`/repos/${repo.full_name}/commits/${sha}/check-runs?per_page=50`),
          call(`/repos/${repo.full_name}/commits/${sha}/status`),
        ])
        const checks = summarizeChecks(runs?.check_runs ?? [], status)
        if (checks.state === "failure") throw new PolicyError(`CI is failing (${checks.failing.join(", ")}). Fix it before merging.`)
        if (checks.state === "pending") throw new PolicyError(`CI is still running (${checks.pending.join(", ")}). Check again shortly.`)

        const merged = await call(`/repos/${repo.full_name}/pulls/${input.number}/merge`, {
          method: "PUT",
          body: { merge_method: input.method ?? "squash", sha },
        })
        return {
          ok: true,
          summary: `Merged PR #${pr.number} into ${pr.base?.ref} (${short(String(merged?.sha ?? sha))})`,
          url: String(pr.html_url),
        }
      })
    },

    /** @param {{ repo: string, branch?: string }} input */
    listWorkflowRuns(input) {
      return guarded(async () => {
        const repo = resolveRepo(input.repo)
        const query = new URLSearchParams({ per_page: "8" })
        if (input.branch) query.set("branch", input.branch)
        const data = await call(`/repos/${repo.full_name}/actions/runs?${query}`)
        const runs = Array.isArray(data?.workflow_runs) ? data.workflow_runs : []
        const lines = runs.map((/** @type {Record<string, any>} */ run) =>
          `#${run.id} ${run.name} — ${run.status === "completed" ? run.conclusion : run.status} — ${run.head_branch} @ ${short(run.head_sha)}`
        )
        return { ok: true, summary: `${runs.length} recent workflow run${runs.length === 1 ? "" : "s"}`, content: lines.join("\n") || "No workflow runs found." }
      })
    },

    /** @param {{ repo: string, runId: number }} input */
    getRunFailure(input) {
      return guarded(async () => {
        const repo = resolveRepo(input.repo)
        const data = await call(`/repos/${repo.full_name}/actions/runs/${input.runId}/jobs?per_page=30`)
        const jobs = Array.isArray(data?.jobs) ? data.jobs : []
        const failed = jobs.filter((/** @type {Record<string, any>} */ job) => ["failure", "cancelled", "timed_out"].includes(job.conclusion))
        if (!failed.length) {
          const active = jobs.filter((/** @type {Record<string, any>} */ job) => job.status !== "completed").length
          return { ok: true, summary: active ? `Run ${input.runId} is still in progress.` : `Run ${input.runId} has no failed jobs.` }
        }
        const sections = []
        for (const job of failed.slice(0, 2)) {
          const steps = (job.steps ?? []).filter((/** @type {Record<string, any>} */ step) => step.conclusion === "failure").map((/** @type {Record<string, any>} */ step) => step.name)
          let logText = ""
          try {
            logText = extractErrorContext(String(await call(`/repos/${repo.full_name}/actions/jobs/${job.id}/logs`, { text: true })))
          } catch {
            logText = "(logs are unavailable or expired)"
          }
          sections.push(`## ${job.name}${steps.length ? ` — failed step: ${steps.join(", ")}` : ""}\n${logText}`)
        }
        return {
          ok: true,
          summary: `${failed.length} failed job${failed.length === 1 ? "" : "s"} in run ${input.runId}`,
          content: clipText(sections.join("\n\n"), LIMITS.maxLogChars * 2),
        }
      })
    },

    /** @param {{ repo: string, state?: "open" | "closed" | "all", labels?: string }} input */
    listIssues(input) {
      return guarded(async () => {
        const repo = resolveRepo(input.repo)
        const query = new URLSearchParams({ state: input.state ?? "open", per_page: "20" })
        if (input.labels) query.set("labels", input.labels)
        const data = await call(`/repos/${repo.full_name}/issues?${query}`)
        const items = (Array.isArray(data) ? data : []).filter((/** @type {Record<string, any>} */ item) => !item.pull_request)
        return {
          ok: true,
          summary: `${items.length} issue${items.length === 1 ? "" : "s"}`,
          content: items.map((/** @type {Record<string, any>} */ item) => `#${item.number} ${item.title} [${item.state}]`).join("\n") || "No issues found.",
        }
      })
    },

    /** @param {{ repo: string, number: number }} input */
    getIssue(input) {
      return guarded(async () => {
        const repo = resolveRepo(input.repo)
        const [issue, comments] = await Promise.all([
          call(`/repos/${repo.full_name}/issues/${input.number}`),
          call(`/repos/${repo.full_name}/issues/${input.number}/comments?per_page=5`),
        ])
        const lines = [
          `#${issue.number} ${issue.title} [${issue.state}]${issue.pull_request ? " (pull request)" : ""}`,
          "",
          clipText(String(issue.body ?? "(no description)"), 4000),
          ...(Array.isArray(comments) ? comments.map((/** @type {Record<string, any>} */ comment) => `\n— ${comment.user?.login}: ${clipText(String(comment.body ?? ""), 1200)}`) : []),
        ]
        return { ok: true, summary: `Issue #${issue.number}: ${issue.title}`, content: lines.join("\n"), url: String(issue.html_url) }
      })
    },

    /** @param {{ repo: string, title: string, body?: string, labels?: string[] }} input */
    createIssue(input) {
      return guarded(async () => {
        const repo = resolveRepo(input.repo)
        const issue = await call(`/repos/${repo.full_name}/issues`, {
          method: "POST",
          body: { title: input.title.trim().slice(0, 250), body: (input.body ?? "").slice(0, 20_000), ...(input.labels?.length ? { labels: input.labels.slice(0, 10) } : {}) },
        })
        return { ok: true, summary: `Created issue #${issue.number}: ${issue.title}`, url: String(issue.html_url) }
      })
    },

    /** @param {{ repo: string, number: number, body: string }} input */
    comment(input) {
      return guarded(async () => {
        const repo = resolveRepo(input.repo)
        if (!input.body.trim()) throw new PolicyError("Comment text is required.")
        const comment = await call(`/repos/${repo.full_name}/issues/${input.number}/comments`, { method: "POST", body: { body: input.body.slice(0, 20_000) } })
        return { ok: true, summary: `Commented on #${input.number}`, url: String(comment.html_url) }
      })
    },
  }
}
