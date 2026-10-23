"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

export function LoginForm() {
  const router = useRouter()
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [showPassword, setShowPassword] = React.useState(false)
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
        <div className="relative">
          <input id="login-password" type={showPassword ? "text" : "password"} autoComplete="current-password" required maxLength={1024} value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-11 w-full rounded-xl border border-border bg-background px-3 pr-11 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <button
            type="button"
            onClick={() => setShowPassword((visible) => !visible)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            {showPassword ? (
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                <path d="M3 3l18 18" />
                <path d="M10.6 10.6a2 2 0 002.8 2.8" />
                <path d="M9.9 5.2A10.8 10.8 0 0112 5c5 0 8.5 4.5 9.5 7-.4 1-1.2 2.2-2.3 3.3" />
                <path d="M6.2 6.2C3.9 7.6 2.7 9.6 2.5 12c1 2.5 4.5 7 9.5 7 1 0 2-.2 2.9-.5" />
              </svg>
            ) : (
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                <path d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </div>
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
