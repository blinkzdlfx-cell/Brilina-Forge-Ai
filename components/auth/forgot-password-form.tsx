"use client"

import * as React from "react"
import Link from "next/link"

export function ForgotPasswordForm() {
  const [email, setEmail] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [submitted, setSubmitted] = React.useState(false)
  const [error, setError] = React.useState("")

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError("")
    setSubmitted(false)

    try {
      const response = await fetch("/api/auth/password-reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      })
      if (!response.ok) {
        throw new Error("The request could not be submitted. Please try again shortly.")
      }
      setSubmitted(true)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The request could not be submitted. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  if (submitted) {
    return (
      <div className="space-y-4">
        <p role="status" className="rounded-xl border border-border bg-muted/50 p-4 text-sm leading-6">
          If that email belongs to an enabled account, a password-reset link will be sent. Check your inbox and spam folder. The link may expire, and you can request another one if needed.
        </p>
        <Link href="/login" className="flex h-11 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Return to sign in
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="w-full space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="forgot-email" className="text-sm font-medium">Email address</label>
        <input
          id="forgot-email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          maxLength={320}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <button type="submit" disabled={busy} className="h-11 w-full rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60">
        {busy ? "Sending request…" : "Send reset link"}
      </button>
      <p className="text-center text-sm text-muted-foreground">
        Remembered your password?{" "}
        <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  )
}
