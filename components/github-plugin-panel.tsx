"use client"

import * as React from "react"
import { ExternalLinkIcon, GitBranchIcon, LockIcon, SearchIcon, Trash2Icon, XIcon } from "lucide-react"

type AllowedRepo = { full_name: string; default_branch: string }
type AvailableRepo = AllowedRepo & { private: boolean; can_push: boolean; allowed: boolean; pushed_at: string | null }
type Connection = {
  connected: boolean
  login: string | null
  authKind: "oauth" | "pat" | null
  scopes: string | null
  repos: AllowedRepo[]
  oauthAvailable: boolean
  workflowEditsEnabled: boolean
}

const OAUTH_ERRORS: Record<string, string> = {
  oauth_not_configured: "GitHub sign-in is not configured on this deployment. Use a personal access token instead.",
  access_denied: "GitHub access was not granted.",
  invalid_state: "The GitHub sign-in expired or was tampered with. Please try again.",
  token_exchange_failed: "GitHub did not accept the sign-in. Please try again.",
  connection_failed: "Could not complete the GitHub connection. Please try again.",
}

const TOKEN_URL =
  "https://github.com/settings/personal-access-tokens/new"

async function readJson<T>(response: Response): Promise<T & { error?: string }> {
  return (await response.json().catch(() => ({}))) as T & { error?: string }
}

export function GithubPluginPanel({ onClose }: { onClose: () => void }) {
  const [connection, setConnection] = React.useState<Connection | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState(() => {
    // The OAuth callback reports failures as ?github_error=<code>.
    if (typeof window === "undefined") return ""
    const reason = new URLSearchParams(window.location.search).get("github_error")
    return reason ? (OAUTH_ERRORS[reason] ?? "GitHub connection failed.") : ""
  })
  const [notice, setNotice] = React.useState("")
  const [token, setToken] = React.useState("")
  const [picker, setPicker] = React.useState<{ repos: AvailableRepo[]; page: number; hasMore: boolean } | null>(null)
  const [pickerLoading, setPickerLoading] = React.useState(false)
  const [filter, setFilter] = React.useState("")
  const [selected, setSelected] = React.useState<Set<string>>(new Set())

  const load = React.useCallback(async () => {
    try {
      const response = await fetch("/api/github/connection", { cache: "no-store" })
      const payload = await readJson<Connection>(response)
      if (!response.ok) throw new Error(payload.error ?? "Could not load the GitHub plugin.")
      setConnection(payload)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load the GitHub plugin.")
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    const frame = window.requestAnimationFrame(() => void load())
    // Clean the callback parameters so a refresh does not reopen this panel.
    if (/[?&](plugins|github_error)=/.test(window.location.search)) {
      window.history.replaceState(null, "", window.location.pathname)
    }
    return () => window.cancelAnimationFrame(frame)
  }, [load])

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  async function connectWithToken(event: React.FormEvent) {
    event.preventDefault()
    if (!token.trim()) return
    setBusy(true); setError(""); setNotice("")
    try {
      const response = await fetch("/api/github/connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim() }),
      })
      const payload = await readJson<{ login?: string }>(response)
      if (!response.ok) throw new Error(payload.error ?? "Could not connect GitHub.")
      setToken("")
      setNotice(`Connected as @${payload.login}. Now choose the repositories the agent may use.`)
      await load()
      void openPicker()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not connect GitHub.")
    } finally {
      setBusy(false)
    }
  }

  async function disconnect() {
    if (!window.confirm("Disconnect GitHub? The stored token and the repository list will be deleted.")) return
    setBusy(true); setError(""); setNotice("")
    try {
      const response = await fetch("/api/github/connection", { method: "DELETE" })
      const payload = await readJson<unknown>(response)
      if (!response.ok) throw new Error(payload.error ?? "Could not disconnect GitHub.")
      setPicker(null)
      setSelected(new Set())
      await load()
      setNotice("GitHub disconnected.")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not disconnect GitHub.")
    } finally {
      setBusy(false)
    }
  }

  async function loadPickerPage(page: number) {
    setPickerLoading(true); setError("")
    try {
      const response = await fetch(`/api/github/repos?available=1&page=${page}`, { cache: "no-store" })
      const payload = await readJson<{ repos?: AvailableRepo[]; hasMore?: boolean }>(response)
      if (!response.ok || !payload.repos) throw new Error(payload.error ?? "Could not load your repositories.")
      const incoming = payload.repos
      setPicker((current) => ({
        repos: page === 1 || !current ? incoming : [...current.repos, ...incoming],
        page,
        hasMore: Boolean(payload.hasMore),
      }))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load your repositories.")
    } finally {
      setPickerLoading(false)
    }
  }

  async function openPicker() {
    setSelected(new Set())
    setFilter("")
    await loadPickerPage(1)
  }

  async function updateRepos(change: { add?: string[]; remove?: string[] }) {
    setBusy(true); setError(""); setNotice("")
    try {
      const response = await fetch("/api/github/repos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(change),
      })
      const payload = await readJson<{ repos?: AllowedRepo[]; rejected?: Array<{ repo: string; reason: string }> }>(response)
      if (!response.ok || !payload.repos) throw new Error(payload.error ?? "Could not update repositories.")
      const repos = payload.repos
      setConnection((current) => (current ? { ...current, repos } : current))
      setPicker((current) => current && {
        ...current,
        repos: current.repos.map((repo) => ({ ...repo, allowed: repos.some((item) => item.full_name.toLowerCase() === repo.full_name.toLowerCase()) })),
      })
      setSelected(new Set())
      if (payload.rejected?.length) setError(payload.rejected.map((item) => `${item.repo}: ${item.reason}`).join(" "))
      else if (change.add?.length) setNotice(`Added ${change.add.length} repositor${change.add.length === 1 ? "y" : "ies"}.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update repositories.")
    } finally {
      setBusy(false)
    }
  }

  const visiblePicker = (picker?.repos ?? []).filter((repo) => repo.full_name.toLowerCase().includes(filter.trim().toLowerCase()))
  const fieldClass = "h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-3 backdrop-blur-sm" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section role="dialog" aria-modal="true" aria-label="GitHub plugin" className="flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-2xl">
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">GitHub plugin</h2>
            <p className="mt-1 text-xs text-muted-foreground">Let Brilina Forge read, edit, and ship code in the repositories you choose.</p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="rounded-lg p-2 text-muted-foreground hover:bg-muted"><XIcon className="size-4" /></button>
        </header>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-4">
          {loading ? <p role="status" className="text-sm text-muted-foreground">Loading…</p> : !connection?.connected ? (
            <>
              <section className="space-y-3">
                <h3 className="text-sm font-semibold">Connect your account</h3>
                {connection?.oauthAvailable && (
                  <a href="/api/github/oauth/start" className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90">
                    <GitBranchIcon className="size-4" />Continue with GitHub
                  </a>
                )}
                <form onSubmit={(event) => void connectWithToken(event)} className="space-y-2">
                  <label className="block text-sm font-medium">
                    {connection?.oauthAvailable ? "Or paste a personal access token" : "Personal access token"}
                    <input type="password" autoComplete="off" spellCheck={false} value={token} onChange={(event) => setToken(event.target.value)} placeholder="github_pat_…" className={`mt-1.5 ${fieldClass}`} />
                  </label>
                  <button type="submit" disabled={busy || !token.trim()} className="h-10 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">{busy ? "Connecting…" : "Connect"}</button>
                </form>
                <div className="rounded-xl border border-border p-3 text-xs leading-5 text-muted-foreground">
                  <p className="font-medium text-foreground">Recommended: a fine-grained token</p>
                  <p>Create one at <a className="underline underline-offset-2" href={TOKEN_URL} target="_blank" rel="noreferrer noopener">github.com/settings/personal-access-tokens/new <ExternalLinkIcon className="inline size-3" /></a>, choose <em>Only select repositories</em>, and grant these repository permissions: Contents (read and write), Pull requests (read and write), Issues (read and write), Actions (read and write), Commit statuses (read), Metadata (read).</p>
                  <p className="mt-1">The token is encrypted before it is stored and is never sent to your browser again.</p>
                </div>
              </section>
            </>
          ) : (
            <>
              <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">Connected as @{connection.login}</p>
                  <p className="text-xs text-muted-foreground">{connection.authKind === "oauth" ? "GitHub sign-in" : "Personal access token"}{connection.scopes ? ` · ${connection.scopes}` : ""}</p>
                </div>
                <button type="button" disabled={busy} onClick={() => void disconnect()} className="rounded-xl px-3 py-2 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50">Disconnect</button>
              </section>

              <section className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">Allowed repositories ({connection.repos.length})</h3>
                  <button type="button" disabled={busy || pickerLoading} onClick={() => void openPicker()} className="rounded-xl border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50">Add repositories</button>
                </div>
                {connection.repos.length === 0 ? <p className="text-sm text-muted-foreground">No repositories yet. The agent can only touch repositories on this list.</p> : (
                  <ul className="divide-y divide-border rounded-xl border border-border">
                    {connection.repos.map((repo) => (
                      <li key={repo.full_name} className="flex items-center gap-3 px-3 py-2.5">
                        <span className="min-w-0 flex-1 truncate text-sm">{repo.full_name}<span className="ml-2 text-xs text-muted-foreground">{repo.default_branch}</span></span>
                        <button type="button" disabled={busy} aria-label={`Remove ${repo.full_name}`} title="Remove" onClick={() => void updateRepos({ remove: [repo.full_name] })} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-50"><Trash2Icon className="size-4" /></button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {picker && (
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold">Choose repositories to allow</h3>
                  <label className="flex items-center gap-2 rounded-xl border border-border px-3"><SearchIcon className="size-4 text-muted-foreground" /><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter loaded repositories…" className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none" /></label>
                  <ul className="max-h-60 divide-y divide-border overflow-y-auto rounded-xl border border-border">
                    {visiblePicker.map((repo) => {
                      const disabled = repo.allowed || !repo.can_push
                      return (
                        <li key={repo.full_name}>
                          <label className={`flex items-center gap-3 px-3 py-2.5 text-sm ${disabled ? "opacity-60" : "cursor-pointer hover:bg-muted"}`}>
                            <input type="checkbox" disabled={disabled} checked={repo.allowed || selected.has(repo.full_name)} onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(repo.full_name); else next.delete(repo.full_name); return next })} className="size-4 accent-primary" />
                            <span className="min-w-0 flex-1 truncate">{repo.full_name}</span>
                            {repo.private && <LockIcon className="size-3.5 text-muted-foreground" aria-label="Private" />}
                            <span className="text-xs text-muted-foreground">{repo.allowed ? "Added" : repo.can_push ? "" : "Read-only"}</span>
                          </label>
                        </li>
                      )
                    })}
                    {visiblePicker.length === 0 && <li className="px-3 py-4 text-center text-sm text-muted-foreground">{pickerLoading ? "Loading…" : "No repositories match."}</li>}
                  </ul>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button type="button" disabled={!picker.hasMore || pickerLoading} onClick={() => void loadPickerPage(picker.page + 1)} className="rounded-xl px-3 py-2 text-sm hover:bg-muted disabled:opacity-40">{pickerLoading ? "Loading…" : picker.hasMore ? "Load more" : "All loaded"}</button>
                    <button type="button" disabled={busy || selected.size === 0} onClick={() => void updateRepos({ add: [...selected] })} className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">Add {selected.size || ""} selected</button>
                  </div>
                </section>
              )}

              <section className="rounded-xl border border-border p-3 text-xs leading-5 text-muted-foreground">
                <p className="font-medium text-foreground">What the agent can and cannot do</p>
                <p>It reads code, creates <code>forge/*</code> branches, commits, opens pull requests, reads CI results, and merges pull requests only from <code>forge/*</code> branches with passing checks. It cannot push to your default branch directly{connection.workflowEditsEnabled ? "" : " or edit GitHub Actions workflow files"}.</p>
              </section>
            </>
          )}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
        </div>
      </section>
    </div>
  )
}
