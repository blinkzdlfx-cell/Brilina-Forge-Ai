import { requireUser } from "@/lib/auth/require-user"

type RouteContext = { params: Promise<{ conversationId: string }> }
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const { conversationId } = await context.params
  if (!UUID_PATTERN.test(conversationId)) return Response.json({ error: "conversation_not_found" }, { status: 404 })

  const { data: conversation } = await auth.supabase.from("conversations")
    .select("id").eq("id", conversationId).eq("user_id", auth.user.id).maybeSingle()
  if (!conversation) return Response.json({ error: "conversation_not_found" }, { status: 404 })

  let body: { messageId?: unknown }
  try {
    body = await request.json() as { messageId?: unknown }
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 })
  }
  if (typeof body.messageId !== "string" || !body.messageId) return Response.json({ error: "invalid_message_id" }, { status: 400 })

  const { data: userMessage, error } = await auth.supabase.from("messages")
    .select("id, sequence_number").eq("conversation_id", conversationId)
    .eq("client_message_id", body.messageId).eq("role", "user").maybeSingle()
  if (error || !userMessage) return Response.json({ error: "message_not_found" }, { status: 404 })

  const { error: branchError } = await auth.supabase.from("messages")
    .update({ is_active_version: false })
    .eq("conversation_id", conversationId)
    .gte("sequence_number", userMessage.sequence_number)
  if (branchError) return Response.json({ error: "branch_update_failed" }, { status: 500 })

  return Response.json({ success: true })
}
