import { redirect } from "next/navigation"
import type { Metadata } from "next"

import { AdminMfaPanel } from "@/components/auth/admin-mfa-panel"
import { UsersPanel } from "@/components/admin/users-panel"
import { getUserContext } from "@/lib/auth/require-user"

export const metadata: Metadata = {
  title: "Administration · Brilina Forge AI",
}

export default async function AdminPage() {
  const context = await getUserContext({ allowMustChange: true })
  if (!context.ok) redirect("/login")
  if (context.access.must_change_password) redirect("/change-password")
  if (context.user.app_metadata?.role !== "owner") redirect("/")

  const { data: assurance, error } = await context.supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (error || assurance?.currentLevel !== "aal2") {
    return (
      <main className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto bg-background px-4 py-8">
        <AdminMfaPanel />
      </main>
    )
  }

  return (
    <main className="flex min-h-0 flex-1 justify-center overflow-y-auto bg-background px-4 py-8">
      <UsersPanel />
    </main>
  )
}
