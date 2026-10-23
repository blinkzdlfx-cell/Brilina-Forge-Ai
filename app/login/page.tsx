import type { Metadata } from "next"

import { LoginForm } from "@/components/auth/login-form"

export const metadata: Metadata = {
  title: "Sign in · Brilina Forge AI",
  description: "Sign in to your Brilina Forge AI account.",
}

export default function LoginPage() {
  return (
    <main className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto bg-background px-4 py-8">
      <section className="w-full max-w-md space-y-6 rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Brilina Dev</p>
          <h1 className="text-3xl font-semibold tracking-tight">Sign in to Forge</h1>
          <p className="text-sm text-muted-foreground">Use the email and password provided by the Brilina Forge owner.</p>
        </div>
        <LoginForm />
      </section>
    </main>
  )
}
