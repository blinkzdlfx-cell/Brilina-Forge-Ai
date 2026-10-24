import { requireUser } from "@/lib/auth/require-user"

type RouteContext = { params: Promise<{ conversationId: string }> }
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response
  const { conversationId } = await context.params
  if (!UUID_PATTERN.test(conversationId)) return Response.json({ error: "conversation_not_found" }, { status: 404 })

  const { data: conversation, error: conversationError } = await auth.supabase
    .from("conversations")
    .select("id, title, is_pinned, archived_at, created_at, updated_at")
    .eq("id", conversationId)
    .eq("user_id", auth.user.id)
    .maybeSingle()
  if (conversationError || !conversation) return Response.json({ error: "conversation_not_found" }, { status: 404 })

  const { data: rows, error } = await auth.supabase
    .from("messages")
    .select("id, client_message_id, role, parts, sequence_number, status, created_at")
    .eq("conversation_id", conversationId)
    .order("sequence_number", { ascending: true })
    .limit(500)
  if (error) return Response.json({ error: "messages_unavailable" }, { status: 500 })

  const messages = (rows ?? []).map((row) => ({
    id: row.client_message_id || row.id,
    role: row.role,
    parts: row.parts,
    status: row.status,
    createdAt: row.created_at,
  }))
  return Response.json({ conversation, messages })
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response
  const { conversationId } = await context.params
  if (!UUID_PATTERN.test(conversationId)) return Response.json({ error: "conversation_not_found" }, { status: 404 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 })
  }
  if (!body || typeof body !== "object") return Response.json({ error: "invalid_update" }, { status: 400 })

  const input = body as { title?: unknown; is_pinned?: unknown; archived?: unknown }
  const update: { title?: string; is_pinned?: boolean; archived_at?: string | null } = {}
  if (input.title !== undefined) {
    if (typeof input.title !== "string" || !input.title.trim() || input.title.trim().length > 300) {
      return Response.json({ error: "invalid_title" }, { status: 400 })
    }
    update.title = input.title.trim()
  }
  if (input.is_pinned !== undefined) {
    if (typeof input.is_pinned !== "boolean") return Response.json({ error: "invalid_pin_state" }, { status: 400 })
    update.is_pinned = input.is_pinned
  }
  if (input.archived !== undefined) {
    if (typeof input.archived !== "boolean") return Response.json({ error: "invalid_archive_state" }, { status: 400 })
    update.archived_at = input.archived ? new Date().toISOString() : null
  }
  if (!Object.keys(update).length) return Response.json({ error: "empty_update" }, { status: 400 })

  const { data, error } = await auth.supabase
    .from("conversations")
    .update(update)
    .eq("id", conversationId)
    .eq("user_id", auth.user.id)
    .select("id, title, is_pinned, archived_at, created_at, updated_at")
    .maybeSingle()
  if (error || !data) return Response.json({ error: "conversation_update_failed" }, { status: 404 })
  return Response.json({ conversation: data })
}

export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response
  const { conversationId } = await context.params
  if (!UUID_PATTERN.test(conversationId)) return Response.json({ error: "conversation_not_found" }, { status: 404 })

  const { data, error } = await auth.supabase
    .from("conversations")
    .delete()
    .eq("id", conversationId)
    .eq("user_id", auth.user.id)
    .select("id")
    .maybeSingle()
  if (error || !data) return Response.json({ error: "conversation_delete_failed" }, { status: 404 })
  return Response.json({ success: true, id: data.id })
}
