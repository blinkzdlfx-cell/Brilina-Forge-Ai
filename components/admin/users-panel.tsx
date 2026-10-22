"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

type ManagedUser = {
  id: string
  email: string
  createdAt: string
  isOwner: boolean
  disabled: boolean
  mustChangePassword: boolean
}

export function UsersPanel() {
  const router = useRouter()
  const [users, setUsers] = React.useState<ManagedUser[]>([])
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState("")
  const [notice, setNotice] = React.useState("")

  async function loadUsers() {
    setError("")
    const response = await fetch("/api/admin/users", { cache: "no-store" })
    const result = await response.json().catch(() => null) as { users?: ManagedUser[]; error?: string } | null
    if (!response.ok || !result?.users) throw new Error(result?.error ?? "Could not load users.")
    setUsers(result.users)
  }

  React.useEffect(() => {
    void loadUsers().catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load users."))
  }, [])

  async function submitNewUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError("")
    setNotice("")
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      })
      const result = await response.json().catch(() => null) as { error?: string } | null
      if (!response.ok) throw new Error(result?.error ?? "Could not create user.")
      setEmail("")
      setPassword("")
      setNotice("Account created. Give the temporary password to the user through a secure channel.")
      await loadUsers()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create user.")
    } finally {
      setBusy(false)
    }
  }

  async function updateUser(user: ManagedUser, action: "disable" | "restore" | "temporary_password" | "delete") {
    if (user.isOwner) return
    if (action === "disable" && !window.confirm(`Revoke access for ${user.email}?`)) return
    if (action === "delete" && !window.confirm(`Permanently delete ${user.email} and their app data?`)) return

    let temporaryPassword = ""
    if (action === "temporary_password") {
      temporaryPassword = window.prompt("Enter a new temporary password (12–128 characters). Share it with the user securely.") ?? ""
      if (!temporaryPassword) return
      if (temporaryPassword.length < 12 || temporaryPassword.length > 128) {
        setError("Use a temporary password between 12 and 128 characters.")
        return
      }
    }

    setBusy(true)
    setError("")
    setNotice("")
    try {
      const method = action === "delete" ? "DELETE" : "PATCH"
      const response = await fetch("/api/admin/users", {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          action,
          ...(action === "temporary_password" ? { password: temporaryPassword } : {}),
        }),
      })
      const result = await response.json().catch(() => null) as { error?: string } | null
      if (!response.ok) throw new Error(result?.error ?? "Could not update user.")
      setNotice(action === "delete" ? "User deleted." : action === "temporary_password" ? "Temporary password set. The user must change it at next sign-in." : "User access updated.")
      await loadUsers()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update user.")
    } finally {
      setBusy(false)
    }
  }

  async function signOut() {
    await fetch("/api/auth/sign-out", { method: "POST" })
    router.replace("/login")
    router.refresh()
  }

  return (
    <section className="w-full max-w-4xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Brilina Forge AI</p>
          <h1 className="mt-1 text-2xl font-semibold">User administration</h1>
          <p className="mt-1 text-sm text-muted-foreground">Create accounts, revoke or restore access, and issue temporary passwords.</p>
        </div>
        <button type="button" onClick={() => void signOut()} className="rounded-xl border border-border px-3 py-2 text-sm hover:bg-muted">Sign out</button>
      </header>

      <form onSubmit={submitNewUser} className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div className="space-y-1.5">
          <label htmlFor="new-user-email" className="text-sm font-medium">User email</label>
          <input id="new-user-email" type="email" required maxLength={320} value={email} onChange={(event) => setEmail(event.target.value)}
            className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="new-user-password" className="text-sm font-medium">Temporary password</label>
          <input id="new-user-password" type="password" required minLength={12} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)}
            className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </div>
        <button type="submit" disabled={busy} className="h-10 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60">{busy ? "Working…" : "Create user"}</button>
      </form>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}

      <div className="overflow-hidden rounded-2xl border border-border">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="font-medium">Accounts</h2>
          <button type="button" disabled={busy} onClick={() => void loadUsers().catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load users."))} className="text-sm text-muted-foreground underline-offset-4 hover:underline">Refresh</button>
        </div>
        {users.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">No accounts found, or the user list is still loading.</p>
        ) : (
          <ul className="divide-y divide-border">
            {users.map((user) => (
              <li key={user.id} className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-all text-sm font-medium">{user.email || "No email"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{user.isOwner ? "Owner account" : user.disabled ? "Access revoked" : user.mustChangePassword ? "Must change password" : "Enabled"} · Created {new Date(user.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
                {!user.isOwner && (
                  <div className="flex flex-wrap gap-2">
                    {user.disabled ? (
                      <button type="button" disabled={busy} onClick={() => void updateUser(user, "restore")} className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-60">Restore access</button>
                    ) : (
                      <button type="button" disabled={busy} onClick={() => void updateUser(user, "disable")} className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-60">Revoke access</button>
                    )}
                    <button type="button" disabled={busy || user.disabled} onClick={() => void updateUser(user, "temporary_password")} className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-60">Set temporary password</button>
                    <button type="button" disabled={busy} onClick={() => void updateUser(user, "delete")} className="rounded-lg border border-destructive/40 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/5 disabled:opacity-60">Delete user</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-xs text-muted-foreground">The application limits this list to the first 200 Auth users. Temporary passwords are never returned by the API or written to logs.</p>
    </section>
  )
}
