import { redirect } from "next/navigation"
import type { Metadata } from "next"

import { PasswordChangeForm } from "@/components/auth/password-change-form"
import { getUserContext } from "@/lib/auth/require-user"

export const metadata: Metadata = {
  title: "Change password · Brilina Forge AI",
}

export default async function ChangePasswordPage() {
  const context = await getUserContext({ allowMustChange: true })
  if (!context.ok) redirect("/login")

  return (
    <main className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto bg-background px-4 py-8">
      <section className="w-full max-w-md space-y-5 rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Account security</p>
          <h1 className="text-2xl font-semibold">Change your password</h1>
          <p className="text-sm text-muted-foreground">
            {context.access.must_change_password
              ? "This account must set a new password before using the workspace."
              : "Choose a new password for your account."}
          </p>
        </div>
        <PasswordChangeForm mode="change" />
      </section>
    </main>
  )
}
