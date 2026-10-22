"use client"

import * as React from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import type { SupabaseClient } from "@supabase/supabase-js"

import { createClient } from "@/lib/supabase/client"

export function AdminMfaPanel() {
  const router = useRouter()
  const supabaseRef = React.useRef<SupabaseClient | null>(null)
  const [clientReady, setClientReady] = React.useState(false)
  const [factorId, setFactorId] = React.useState("")
  const [qrCode, setQrCode] = React.useState("")
  const [secret, setSecret] = React.useState("")
  const [code, setCode] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState("")
  const [mode, setMode] = React.useState<"loading" | "enroll" | "challenge">("loading")

  React.useEffect(() => {
    let active = true
    try {
      const client = createClient()
      supabaseRef.current = client
      void client.auth.mfa.listFactors().then(({ data, error: factorError }) => {
        if (!active) return
        if (factorError) {
          setClientReady(true)
          setError("Could not check authenticator setup. Refresh and try again.")
          setMode("enroll")
          return
        }
        setClientReady(true)
        const verified = data.totp.find((factor) => factor.status === "verified")
        if (verified) {
          setFactorId(verified.id)
          setMode("challenge")
        } else {
          setMode("enroll")
        }
      })
    } catch {
      setError("Supabase is not configured. Set the public URL and publishable key in the build environment.")
      setMode("enroll")
    }
    return () => { active = false }
  }, [])

  async function beginEnrollment() {
    const supabase = supabaseRef.current
    if (!supabase) return
    setBusy(true)
    setError("")
    try {
      const { data: factors, error: listError } = await supabase.auth.mfa.listFactors()
      if (listError) throw listError
      for (const factor of factors.totp.filter((item) => item.status === "unverified")) {
        await supabase.auth.mfa.unenroll({ factorId: factor.id })
      }
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Brilina Forge AI owner",
      })
      if (enrollError || !data?.totp) throw enrollError ?? new Error("Enrollment failed")
      setFactorId(data.id)
      setQrCode(data.totp.qr_code)
      setSecret(data.totp.secret)
      setMode("enroll")
    } catch {
      setError("Could not start authenticator enrollment. Try again.")
    } finally {
      setBusy(false)
    }
  }

  async function verify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const supabase = supabaseRef.current
    if (!supabase || !factorId) return
    if (!/^\d{6,8}$/.test(code.trim())) {
      setError("Enter the current code from your authenticator app.")
      return
    }
    setBusy(true)
    setError("")
    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId })
      if (challengeError) throw challengeError
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code: code.trim(),
      })
      if (verifyError) throw verifyError
      router.refresh()
    } catch {
      setError("The authenticator code was not accepted. Check the time on your phone and try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="w-full max-w-lg space-y-5 rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Owner security</p>
        <h1 className="text-2xl font-semibold">Verify your authenticator</h1>
        <p className="text-sm text-muted-foreground">
          Administrative data and controls stay hidden until the owner verifies a time-based one-time password. Normal chat does not require MFA.
        </p>
      </div>
      {mode === "loading" && <p className="text-sm text-muted-foreground">Checking authenticator setup…</p>}
      {mode === "enroll" && !qrCode && (
        <button type="button" disabled={busy || !clientReady} onClick={() => void beginEnrollment()} className="h-11 w-full rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60">
          {busy ? "Preparing…" : "Set up authenticator"}
        </button>
      )}
      {qrCode && (
        <div className="space-y-3 rounded-xl border border-border p-4">
          <p className="text-sm">Scan this QR code with your authenticator app, then enter the generated code below.</p>
          {/* Supabase returns a data URI for the QR code; it is not persisted. */}
          <Image src={qrCode} alt="Authenticator setup QR code" width={192} height={192} unoptimized className="mx-auto size-48 rounded-lg bg-white p-2" />
          <details>
            <summary className="cursor-pointer text-sm text-muted-foreground">Can&apos;t scan the QR code?</summary>
            <code className="mt-2 block break-all text-xs">{secret}</code>
          </details>
        </div>
      )}
      {(mode === "challenge" || Boolean(qrCode)) && (
        <form onSubmit={verify} className="space-y-3">
          <label htmlFor="totp-code" className="block text-sm font-medium">Authenticator code</label>
          <input id="totp-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,8}" maxLength={8} required value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
            className="h-11 w-full rounded-xl border border-border bg-background px-3 text-center text-lg tracking-[0.3em] outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <button type="submit" disabled={busy} className="h-11 w-full rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60">
            {busy ? "Verifying…" : "Verify and continue"}
          </button>
        </form>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">If you lose access to your authenticator, recover the account through the owner-controlled Supabase process.</p>
    </section>
  )
}
