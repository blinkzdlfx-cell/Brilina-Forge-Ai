import { requireUser } from "@/lib/auth/require-user"

type RouteContext = { params: Promise<{ conversationId: string }> }
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const { conversationId } = await context.params
  if (!UUID_PATTERN.test(conversationId)) return Response.json({ error: "conversation_not_found" }, { status: 404 })

  let body: { turnMessageId?: unknown; versionNumber?: unknown }
  try {
    body = await request.json() as { turnMessageId?: unknown; versionNumber?: unknown }
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 })
  }
  if (typeof body.turnMessageId !== "string" || !body.turnMessageId || !Number.isInteger(body.versionNumber) || Number(body.versionNumber) < 1) {
    return Response.json({ error: "invalid_version" }, { status: 400 })
  }

  const { data: conversation } = await auth.supabase.from("conversations")
    .select("id").eq("id", conversationId).eq("user_id", auth.user.id).maybeSingle()
  if (!conversation) return Response.json({ error: "conversation_not_found" }, { status: 404 })

  const { data: target, error: targetError } = await auth.supabase.from("messages")
    .select("id").eq("conversation_id", conversationId).eq("role", "assistant")
    .eq("turn_message_id", body.turnMessageId).eq("version_number", Number(body.versionNumber)).maybeSingle()
  if (targetError || !target) return Response.json({ error: "version_not_found" }, { status: 404 })

  const { error: deactivateError } = await auth.supabase.from("messages")
    .update({ is_active_version: false }).eq("conversation_id", conversationId)
    .eq("role", "assistant").eq("turn_message_id", body.turnMessageId)
  if (deactivateError) return Response.json({ error: "version_update_failed" }, { status: 500 })

  const { error: activateError } = await auth.supabase.from("messages")
    .update({ is_active_version: true }).eq("id", target.id).eq("conversation_id", conversationId)
  if (activateError) return Response.json({ error: "version_update_failed" }, { status: 500 })

  return Response.json({ success: true, turnMessageId: body.turnMessageId, versionNumber: Number(body.versionNumber) })
}
