"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { createClient } from "@/lib/supabase/client"

export function PasswordChangeForm({ mode }: { mode: "change" | "reset" }) {
  const router = useRouter()
  const [password, setPassword] = React.useState("")
  const [confirmPassword, setConfirmPassword] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState("")
  const [success, setSuccess] = React.useState("")

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    setSuccess("")
    if (password.length < 12 || password.length > 128) {
      setError("Use a password between 12 and 128 characters.")
      return
    }
    if (password !== confirmPassword) {
      setError("The passwords do not match.")
      return
    }

    setBusy(true)
    try {
      if (mode === "change") {
        const response = await fetch("/api/auth/change-password", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ password }),
        })
        const result = await response.json().catch(() => null) as { error?: string } | null
        if (!response.ok) throw new Error(result?.error ?? "Password could not be changed.")
        router.replace("/")
        router.refresh()
        return
      }

      const supabase = createClient()
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) {
        const message = updateError.message.toLowerCase()
        if (message.includes("session") || message.includes("token") || message.includes("auth")) {
          throw new Error("The recovery session is missing or invalid. Request a new password-reset email and open the newest link in the same browser. If this continues, share this exact error: " + updateError.message)
        }
        throw new Error("Password reset failed: " + updateError.message)
      }
      await supabase.auth.signOut()
      setSuccess("Password updated. Sign in with your new password.")
      router.replace("/login?reset=1")
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Password could not be changed.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="w-full space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="new-password" className="text-sm font-medium">New password</label>
        <input id="new-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="confirm-password" className="text-sm font-medium">Confirm new password</label>
        <input id="confirm-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {success && <p role="status" className="text-sm text-muted-foreground">{success}</p>}
      <button type="submit" disabled={busy} className="h-11 w-full rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60">
        {busy ? "Saving…" : "Update password"}
      </button>
    </form>
  )
}
