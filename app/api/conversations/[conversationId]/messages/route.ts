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
  const { data: existingRows, error: existingError } = await auth.supabase
    .from("messages")
    .select("id, client_message_id, sequence_number, role, parts, status")
    .eq("conversation_id", conversationId)
    .in("client_message_id", ids.length ? ids : ["__none__"])
  if (existingError) return Response.json({ error: "messages_unavailable" }, { status: 500 })

  const existingByClientId = new Map((existingRows ?? []).map((row) => [row.client_message_id, row]))
  const { data: lastRows, error: lastError } = await auth.supabase
    .from("messages")
    .select("sequence_number")
    .eq("conversation_id", conversationId)
    .order("sequence_number", { ascending: false })
    .limit(1)
  if (lastError) return Response.json({ error: "messages_unavailable" }, { status: 500 })
  let nextSequence = Number(lastRows?.[0]?.sequence_number ?? -1) + 1
  let saved = 0

  for (const message of messages) {
    const existing = existingByClientId.get(message.client_message_id)
    if (existing) {
      // A stable assistant ID may first be saved as interrupted and later be
      // completed after a retry. Refresh that same row rather than duplicating it.
      if (existing.role === "assistant" &&
          (existing.status !== message.status || JSON.stringify(existing.parts) !== JSON.stringify(message.parts))) {
        const { error: updateError } = await auth.supabase.from("messages")
          .update({ parts: message.parts, status: message.status })
          .eq("id", existing.id).eq("conversation_id", conversationId)
        if (updateError) return Response.json({ error: "message_update_failed" }, { status: 500 })
      }
      continue
    }

    let inserted = false
    for (let attempt = 0; attempt < 3 && !inserted; attempt++) {
      const { error: insertError } = await auth.supabase.from("messages").insert({
        id: crypto.randomUUID(),
        conversation_id: conversationId,
        role: message.role,
        parts: message.parts,
        sequence_number: nextSequence,
        status: message.status,
        client_message_id: message.client_message_id,
      })
      if (!insertError) {
        nextSequence += 1
        saved += 1
        inserted = true
        continue
      }

      if (insertError.code !== "23505") {
        return Response.json({ error: "message_save_failed" }, { status: 500 })
      }

      // A concurrent request may have inserted this same client ID, or claimed
      // the sequence number first. Distinguish those cases before retrying.
      const { data: duplicate } = await auth.supabase.from("messages")
        .select("id, client_message_id, sequence_number, role, parts, status")
        .eq("conversation_id", conversationId)
        .eq("client_message_id", message.client_message_id)
        .maybeSingle()
      if (duplicate) {
        existingByClientId.set(message.client_message_id, duplicate)
        inserted = true
        continue
      }
      const { data: latest, error: latestError } = await auth.supabase.from("messages")
        .select("sequence_number").eq("conversation_id", conversationId)
        .order("sequence_number", { ascending: false }).limit(1)
      if (latestError) return Response.json({ error: "messages_unavailable" }, { status: 500 })
      nextSequence = Number(latest?.[0]?.sequence_number ?? -1) + 1
    }
    if (!inserted) return Response.json({ error: "message_save_conflict_retry" }, { status: 409 })
  }

  const title = messages.map((message) => message.role === "user" ? extractTitle(message.parts) : null).find(Boolean)
  if (title && conversation.title === "New chat") {
    await auth.supabase.from("conversations").update({ title }).eq("id", conversationId).eq("user_id", auth.user.id)
  } else {
    await auth.supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId).eq("user_id", auth.user.id)
  }

  return Response.json({ success: true, saved, total: messages.length })
}
