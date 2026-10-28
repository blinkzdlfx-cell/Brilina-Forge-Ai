import { generateText } from "ai"

import { requireUser } from "@/lib/auth/require-user"
import { CLOUDFLARE_MODEL_ID, getLanguageModel } from "@/lib/models"

type RouteContext = { params: Promise<{ conversationId: string }> }
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const TITLE_LIMIT = 64

function textFromParts(parts: unknown) {
  if (!Array.isArray(parts)) return ""
  return parts
    .filter((part): part is { type: string; text: string } =>
      Boolean(part && typeof part === "object" &&
        (part as { type?: unknown }).type === "text" &&
        typeof (part as { text?: unknown }).text === "string")
    )
    .map((part) => part.text)
    .join("\n")
    .trim()
}

function normalizeTitle(value: string) {
  return value
    .replace(/^\s*(title\s*:\s*)/i, "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\"'“”‘’]+|[\"'“”‘’]+$/g, "")
    .replace(/[.!?]+$/, "")
    .trim()
    .slice(0, TITLE_LIMIT)
}

export async function POST(_request: Request, context: RouteContext) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const { conversationId } = await context.params
  if (!UUID_PATTERN.test(conversationId)) {
    return Response.json({ error: "conversation_not_found" }, { status: 404 })
  }

  const { data: conversation, error: conversationError } = await auth.supabase
    .from("conversations")
    .select("id,title")
    .eq("id", conversationId)
    .eq("user_id", auth.user.id)
    .maybeSingle()

  if (conversationError || !conversation) {
    return Response.json({ error: "conversation_not_found" }, { status: 404 })
  }

  // Never overwrite a user-chosen title or rename an existing conversation.
  if (conversation.title !== "New chat") {
    return Response.json({ title: conversation.title, skipped: true })
  }

  const { data: rows, error: messagesError } = await auth.supabase
    .from("messages")
    .select("role,parts,status,sequence_number")
    .eq("conversation_id", conversationId)
    .order("sequence_number", { ascending: true })
    .limit(20)

  if (messagesError) {
    return Response.json({ error: "messages_unavailable" }, { status: 500 })
  }

  const firstUserMessage = (rows ?? []).find((row) => row.role === "user")
  const firstAssistantMessage = (rows ?? []).find((row) =>
    row.role === "assistant" && row.status === "complete"
  )
  const userPrompt = textFromParts(firstUserMessage?.parts).slice(0, 2500)
  const assistantReply = textFromParts(firstAssistantMessage?.parts).slice(0, 1200)

  if (!userPrompt || !assistantReply) {
    return Response.json({ title: conversation.title, skipped: true })
  }

  try {
    const result = await generateText({
      model: getLanguageModel(CLOUDFLARE_MODEL_ID),
      system: "Create a concise, specific title for this AI conversation. Use 3–7 words, no quotes, no prefix, and no ending punctuation. Describe the user's actual goal. Do not answer the request.",
      prompt: "First user message:\n" + userPrompt + "\n\nFirst assistant response:\n" + assistantReply,
      maxOutputTokens: 40,
      temperature: 0.2,
    })
    const title = normalizeTitle(result.text)
    if (!title) {
      return Response.json({ error: "title_generation_empty" }, { status: 502 })
    }

    // Compare-and-set prevents this endpoint from replacing a manual rename
    // that happened while title generation was in progress.
    const { data: updated, error: updateError } = await auth.supabase
      .from("conversations")
      .update({ title, updated_at: new Date().toISOString() })
      .eq("id", conversationId)
      .eq("user_id", auth.user.id)
      .eq("title", "New chat")
      .select("id,title")
      .maybeSingle()

    if (updateError) {
      return Response.json({ error: "title_save_failed" }, { status: 500 })
    }

    return Response.json({ title: updated?.title ?? title, skipped: !updated })
  } catch (error) {
    console.error("[forge-title-generation-failed]", {
      conversationId,
      errorName: error instanceof Error ? error.name : "UnknownError",
    })
    return Response.json({ error: "title_generation_failed" }, { status: 502 })
  }
}
