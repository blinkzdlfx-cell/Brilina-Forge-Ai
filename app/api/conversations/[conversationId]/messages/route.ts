import { requireUser } from "@/lib/auth/require-user"

type RouteContext = { params: Promise<{ conversationId: string }> }
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_MESSAGES_PER_SAVE = 100
const MAX_PARTS_PER_MESSAGE = 24
const MAX_PARTS_BYTES = 64 * 1024

function extractTitle(parts: unknown[]) {
  for (const part of parts) {
    if (part && typeof part === "object" && "type" in part && "text" in part) {
      const item = part as { type?: unknown; text?: unknown }
      if (item.type === "text" && typeof item.text === "string" && item.text.trim()) {
        return item.text.trim().slice(0, 64)
      }
    }
  }
  return null
}

function containsInlineDataUrl(value: unknown): boolean {
  if (typeof value === "string") return /^data:[^,]*;base64,/i.test(value)
  if (Array.isArray(value)) return value.some(containsInlineDataUrl)
  if (value && typeof value === "object") return Object.values(value).some(containsInlineDataUrl)
  return false
}

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response
  const { conversationId } = await context.params
  if (!UUID_PATTERN.test(conversationId)) return Response.json({ error: "conversation_not_found" }, { status: 404 })

  const { data: conversation, error: conversationError } = await auth.supabase
    .from("conversations")
    .select("id, title, user_id")
    .eq("id", conversationId)
    .eq("user_id", auth.user.id)
    .maybeSingle()
  if (conversationError || !conversation) return Response.json({ error: "conversation_not_found" }, { status: 404 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 })
  }
  const incoming = body && typeof body === "object" ? (body as { messages?: unknown }).messages : undefined
  if (!Array.isArray(incoming) || incoming.length > MAX_MESSAGES_PER_SAVE) {
    return Response.json({ error: "invalid_messages" }, { status: 400 })
  }

  const messages: Array<{ client_message_id: string; role: "user" | "assistant"; parts: unknown[]; status: "complete" | "interrupted" | "failed" }> = []
  for (const item of incoming) {
    if (!item || typeof item !== "object") return Response.json({ error: "invalid_message" }, { status: 400 })
    const message = item as { id?: unknown; role?: unknown; parts?: unknown; status?: unknown }
    if (typeof message.id !== "string" || !message.id || message.id.length > 200) return Response.json({ error: "invalid_message_id" }, { status: 400 })
    if (message.role !== "user" && message.role !== "assistant") return Response.json({ error: "invalid_message_role" }, { status: 400 })
    if (!Array.isArray(message.parts) || message.parts.length > MAX_PARTS_PER_MESSAGE) return Response.json({ error: "invalid_message_parts" }, { status: 400 })
    if (containsInlineDataUrl(message.parts)) return Response.json({ error: "upload_attachments_before_saving" }, { status: 400 })
    if (new TextEncoder().encode(JSON.stringify(message.parts)).byteLength > MAX_PARTS_BYTES) return Response.json({ error: "message_too_large" }, { status: 413 })
    const status = message.status === "interrupted" || message.status === "failed" ? message.status : "complete"
    messages.push({ client_message_id: message.id, role: message.role, parts: message.parts, status })
  }

  const ids = messages.map((message) => message.client_message_id)
  const { data: existing, error: existingError } = await auth.supabase
    .from("messages")
    .select("client_message_id, sequence_number")
    .eq("conversation_id", conversationId)
    .in("client_message_id", ids.length ? ids : ["__none__"])
  if (existingError) return Response.json({ error: "messages_unavailable" }, { status: 500 })

  const existingIds = new Set((existing ?? []).map((row) => row.client_message_id))
  const missing = messages.filter((message) => !existingIds.has(message.client_message_id))
  const highestSequence = Math.max(-1, ...(existing ?? []).map((row) => Number(row.sequence_number)))
  const { data: allRows, error: allError } = await auth.supabase
    .from("messages")
    .select("sequence_number")
    .eq("conversation_id", conversationId)
    .order("sequence_number", { ascending: false })
    .limit(1)
  if (allError) return Response.json({ error: "messages_unavailable" }, { status: 500 })
  let nextSequence = Math.max(highestSequence, Number(allRows?.[0]?.sequence_number ?? -1)) + 1

  if (missing.length) {
    const inserts = missing.map((message) => ({
      id: crypto.randomUUID(),
      conversation_id: conversationId,
      role: message.role,
      parts: message.parts,
      sequence_number: nextSequence++,
      status: message.status,
      client_message_id: message.client_message_id,
    }))
    const { error } = await auth.supabase.from("messages").insert(inserts)
    if (error) return Response.json({ error: "message_save_failed" }, { status: 500 })
  }

  const title = messages.map((message) => message.role === "user" ? extractTitle(message.parts) : null).find(Boolean)
  if (title && conversation.title === "New chat") {
    await auth.supabase.from("conversations").update({ title }).eq("id", conversationId).eq("user_id", auth.user.id)
  } else {
    await auth.supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId).eq("user_id", auth.user.id)
  }

  return Response.json({ success: true, saved: missing.length, total: messages.length })
}
