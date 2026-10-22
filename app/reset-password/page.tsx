import type { Metadata } from "next"

import { PasswordChangeForm } from "@/components/auth/password-change-form"

export const metadata: Metadata = {
  title: "Reset password · Brilina Forge AI",
}

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto bg-background px-4 py-8">
      <section className="w-full max-w-md space-y-5 rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Account recovery</p>
          <h1 className="text-2xl font-semibold">Set a new password</h1>
          <p className="text-sm text-muted-foreground">Use the recovery link sent to your email. Expired links must be requested again.</p>
        </div>
        <PasswordChangeForm mode="reset" />
      </section>
    </main>
  )
}
