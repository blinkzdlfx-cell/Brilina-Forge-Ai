import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"

import { Chat } from "@/components/chat"
import { getUserContext } from "@/lib/auth/require-user"
import { getAvailableModels } from "@/lib/models"

export const metadata: Metadata = {
  title: "Conversation · Brilina Forge AI",
  description: "A private conversation in Brilina Forge AI.",
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export default async function ConversationPage({ params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await params
  if (!UUID_PATTERN.test(conversationId)) notFound()
  const context = await getUserContext({ allowMustChange: true })
  if (!context.ok) redirect("/login")
  if (context.access.must_change_password) redirect("/change-password")
  const { data: conversation } = await context.supabase.from("conversations").select("id").eq("id", conversationId).eq("user_id", context.user.id).maybeSingle()
  if (!conversation) notFound()
  return <Chat models={getAvailableModels()} initialConversationId={conversationId} />
}
