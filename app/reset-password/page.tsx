import type { Metadata } from "next"
import Link from "next/link"

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
          <p className="text-sm text-muted-foreground">Use the recovery link sent to your email. If the link has expired or already been used, request a new one below.</p>
        </div>
        <PasswordChangeForm mode="reset" />
        <p className="text-center text-sm text-muted-foreground">
          Need another link?{" "}
          <Link href="/forgot-password" className="font-medium text-foreground underline-offset-4 hover:underline">
            Request a new password reset
          </Link>
        </p>
      </section>
    </main>
  )
}
