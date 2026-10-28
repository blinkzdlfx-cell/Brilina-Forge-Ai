import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { Chat } from "@/components/chat"
import { getUserContext } from "@/lib/auth/require-user"
import { getAvailableModels } from "@/lib/models"

export const metadata: Metadata = {
  title: "Chat · Brilina Forge AI",
  description: "A private AI workspace powered by Brilina Forge AI.",
}

export default async function Page() {
  const context = await getUserContext({ allowMustChange: true })
  if (!context.ok) redirect("/login")
  if (context.access.must_change_password) redirect("/change-password")
  const userName = typeof context.user.user_metadata?.full_name === "string" ? context.user.user_metadata.full_name : typeof context.user.user_metadata?.name === "string" ? context.user.user_metadata.name : null
  return <Chat models={getAvailableModels()} userName={userName} />
}
