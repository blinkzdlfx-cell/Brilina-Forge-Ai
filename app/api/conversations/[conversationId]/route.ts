import { requireUser } from "@/lib/auth/require-user"
import { createAdminClient } from "@/lib/supabase/admin"

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
    .select("id, client_message_id, role, parts, sequence_number, status, created_at, turn_message_id, version_number, is_active_version")
    .eq("conversation_id", conversationId)
    .order("sequence_number", { ascending: true })
    .limit(500)
  if (error) return Response.json({ error: "messages_unavailable" }, { status: 500 })

  const allRows = rows ?? []
  const versionCounts = new Map<string, number>()
  const activeVersions = new Map<string, number>()
  for (const row of allRows) {
    if (row.role !== "assistant" || !row.turn_message_id) continue
    versionCounts.set(row.turn_message_id, (versionCounts.get(row.turn_message_id) ?? 0) + 1)
    if (row.is_active_version) activeVersions.set(row.turn_message_id, Number(row.version_number ?? 1))
  }

  const messages = allRows
    .filter((row) => row.is_active_version !== false)
    .map((row) => ({
      id: row.client_message_id || row.id,
      role: row.role,
      parts: row.parts,
      status: row.status,
      createdAt: row.created_at,
      ...(row.role === "user" ? {
        responseVersion: {
          turnMessageId: row.client_message_id || row.id,
          current: activeVersions.get(row.client_message_id || row.id) ?? 1,
          total: versionCounts.get(row.client_message_id || row.id) ?? 0,
        },
      } : {}),
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

  const { data: ownedConversation, error: ownerError } = await auth.supabase
    .from("conversations").select("id").eq("id", conversationId).eq("user_id", auth.user.id).maybeSingle()
  if (ownerError || !ownedConversation) return Response.json({ error: "conversation_not_found" }, { status: 404 })

  const admin = createAdminClient()
  const { data: files, error: filesError } = await admin.from("files")
    .select("id, bucket_id, storage_path").eq("conversation_id", conversationId).eq("user_id", auth.user.id)
  if (filesError) return Response.json({ error: "conversation_files_unavailable" }, { status: 500 })
  for (const bucketId of [...new Set((files ?? []).map((file) => file.bucket_id))]) {
    const paths = (files ?? []).filter((file) => file.bucket_id === bucketId).map((file) => file.storage_path)
    if (paths.length) {
      const { error: storageError } = await admin.storage.from(bucketId).remove(paths)
      if (storageError) return Response.json({ error: "conversation_files_delete_failed" }, { status: 502 })
    }
  }
  if ((files ?? []).length) {
    const { error: metadataError } = await admin.from("files").delete().eq("conversation_id", conversationId).eq("user_id", auth.user.id)
    if (metadataError) return Response.json({ error: "conversation_files_delete_failed" }, { status: 500 })
  }
  const { data, error } = await auth.supabase.from("conversations").delete()
    .eq("id", conversationId).eq("user_id", auth.user.id).select("id").maybeSingle()
  if (error || !data) return Response.json({ error: "conversation_delete_failed" }, { status: 500 })
  return Response.json({ success: true, id: data.id })
}
