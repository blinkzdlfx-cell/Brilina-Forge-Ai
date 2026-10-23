import { redirect } from "next/navigation"
import type { Metadata } from "next"

import { DiagnosticsPanel } from "@/components/admin/diagnostics-panel"
import { getUserContext } from "@/lib/auth/require-user"

export const metadata: Metadata = { title: "Secure Application Diagnostics · Brilina Forge AI" }

export default async function DiagnosticsPage() {
  const context = await getUserContext()
  if (!context.ok) redirect("/login")
  if (context.user.app_metadata?.role !== "owner") redirect("/")
  const { data, error } = await context.supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (error || data?.currentLevel !== "aal2") redirect("/admin")
  return (
    <main className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col gap-5 overflow-y-auto px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Secure Application Diagnostics</h1>
          <p className="mt-1 text-sm text-muted-foreground">Redacted server events from the Cloudflare Worker, stored in Supabase.</p>
        </div>
        <a className="rounded-md border px-3 py-2 text-sm hover:bg-muted" href="/admin">Back to administration</a>
      </div>
      <DiagnosticsPanel />
    </main>
  )
}
