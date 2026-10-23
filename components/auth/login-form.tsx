"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

export function LoginForm() {
  const router = useRouter()
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState("")
  const [notice, setNotice] = React.useState("")

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError("")
    setNotice("")
    try {
      const response = await fetch("/api/auth/sign-in", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      })
      const result = await response.json().catch(() => null) as { error?: string; redirectTo?: string } | null
      if (!response.ok || !result?.redirectTo) {
        setError(result?.error ?? "Sign-in failed. Try again.")
        return
      }
      router.replace(result.redirectTo)
      router.refresh()
    } catch {
      setError("Could not reach the sign-in service. Try again.")
    } finally {
      setBusy(false)
    }
  }

  async function requestReset() {
    setError("")
    setNotice("")
    if (!email.trim()) {
      setError("Enter your email address first.")
      return
    }
    setBusy(true)
    try {
      const response = await fetch("/api/auth/password-reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      })
      if (!response.ok) throw new Error("reset")
      setNotice("If that email belongs to an enabled account, a password-reset link will be sent.")
    } catch {
      setNotice("If that email belongs to an enabled account, a password-reset link will be sent.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="w-full space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="login-email" className="text-sm font-medium">Email</label>
        <input id="login-email" type="email" autoComplete="username" required maxLength={320} value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="login-password" className="text-sm font-medium">Password</label>
        <input id="login-password" type="password" autoComplete="current-password" required maxLength={1024} value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
      <button type="submit" disabled={busy} className="h-11 w-full rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60">
        {busy ? "Please wait…" : "Sign in"}
      </button>
      <button type="button" disabled={busy} onClick={() => void requestReset()} className="w-full rounded-lg px-3 py-2 text-sm text-muted-foreground underline-offset-4 hover:underline disabled:opacity-60">
        Forgot password?
      </button>
      <p className="text-center text-xs text-muted-foreground">Accounts are created by the Brilina Forge owner. Public sign-up is disabled.</p>
    </form>
  )
}
