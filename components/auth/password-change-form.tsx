"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { createClient } from "@/lib/supabase/client"

type RecoveryMfaChallenge = {
  factorId: string
  challengeId: string
  factorType: "totp" | "phone"
}

export function PasswordChangeForm({ mode }: { mode: "change" | "reset" }) {
  const router = useRouter()
  const [password, setPassword] = React.useState("")
  const [confirmPassword, setConfirmPassword] = React.useState("")
  const [mfaCode, setMfaCode] = React.useState("")
  const [mfaChallenge, setMfaChallenge] = React.useState<RecoveryMfaChallenge | null>(null)
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
    if (mfaChallenge && !mfaCode.trim()) {
      setError("Enter the verification code to continue.")
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

      // Password changes for accounts with MFA require an AAL2 session.
      // A recovery link alone may only establish AAL1, so verify a registered
      // factor before calling updateUser.
      if (!mfaChallenge) {
        const { data: assurance, error: assuranceError } =
          await supabase.auth.mfa.getAuthenticatorAssuranceLevel()

        if (assuranceError) throw new Error("Could not verify your recovery session: " + assuranceError.message)

        if (assurance.currentLevel !== "aal2" && assurance.nextLevel === "aal2") {
          const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors()
          if (factorsError) throw new Error("Could not load your verification methods: " + factorsError.message)

          const verifiedFactors = [
            ...(factors.totp ?? []).filter((factor) => factor.status === "verified").map((factor) => ({
              id: factor.id,
              factorType: "totp" as const,
            })),
            ...(factors.phone ?? []).filter((factor) => factor.status === "verified").map((factor) => ({
              id: factor.id,
              factorType: "phone" as const,
            })),
          ]
          const factor = verifiedFactors[0]

          if (!factor) {
            throw new Error("This account requires multi-factor verification, but no verified factor is available. Contact support to recover access.")
          }

          const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
            factorId: factor.id,
          })
          if (challengeError) throw new Error("Could not start multi-factor verification: " + challengeError.message)

          setMfaChallenge({
            factorId: factor.id,
            challengeId: challenge.id,
            factorType: factor.factorType,
          })
          setError(factor.factorType === "phone"
            ? "A verification code has been sent to your registered phone. Enter it below to finish resetting your password."
            : "Enter the current code from your authenticator app to finish resetting your password.")
          return
        }
      } else {
        const { error: verifyError } = await supabase.auth.mfa.verify({
          factorId: mfaChallenge.factorId,
          challengeId: mfaChallenge.challengeId,
          code: mfaCode.trim(),
        })
        if (verifyError) throw new Error("Multi-factor verification failed: " + verifyError.message)
      }

      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) {
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
      {mode === "reset" && mfaChallenge && (
        <div className="space-y-1.5">
          <label htmlFor="mfa-code" className="text-sm font-medium">
            {mfaChallenge.factorType === "phone" ? "SMS verification code" : "Authenticator verification code"}
          </label>
          <input id="mfa-code" type="text" inputMode="numeric" autoComplete="one-time-code" required value={mfaCode}
            onChange={(event) => setMfaCode(event.target.value)}
            className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {success && <p role="status" className="text-sm text-muted-foreground">{success}</p>}
      <button type="submit" disabled={busy} className="h-11 w-full rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60">
        {busy ? "Saving…" : mfaChallenge ? "Verify and update password" : "Update password"}
      </button>
    </form>
  )
}
