import type { Metadata } from "next"

import { ForgotPasswordForm } from "@/components/auth/forgot-password-form"

export const metadata: Metadata = {
  title: "Forgot password · Brilina Forge AI",
  description: "Request a secure password-reset link for Brilina Forge AI.",
}

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto bg-background px-4 py-8">
      <section className="w-full max-w-md space-y-6 rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Account recovery</p>
          <h1 className="text-3xl font-semibold tracking-tight">Forgot your password?</h1>
          <p className="text-sm leading-6 text-muted-foreground">
            Enter the email address associated with your Brilina Forge AI account. We’ll send a secure reset link if the account is eligible.
          </p>
        </div>
        <ForgotPasswordForm />
      </section>
    </main>
  )
}
