import { requireUser } from "@/lib/auth/require-user"

const TITLE_LIMIT = 300

export async function GET(request: Request) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const archived = new URL(request.url).searchParams.get("archived") === "true"
  let query = auth.supabase
    .from("conversations")
    .select("id, title, is_pinned, archived_at, created_at, updated_at")
    .eq("user_id", auth.user.id)

  query = archived ? query.not("archived_at", "is", null) : query.is("archived_at", null)
  const { data, error } = await query
    .order("is_pinned", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(100)

  if (error) return Response.json({ error: "conversations_unavailable" }, { status: 500 })
  return Response.json({ conversations: data ?? [] })
}

export async function POST(request: Request) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 })
  }

  const rawTitle = body && typeof body === "object" ? (body as { title?: unknown }).title : undefined
  const title = typeof rawTitle === "string" ? rawTitle.trim() : "New chat"
  if (!title || title.length > TITLE_LIMIT) {
    return Response.json({ error: "invalid_title" }, { status: 400 })
  }

  const { data, error } = await auth.supabase
    .from("conversations")
    .insert({ user_id: auth.user.id, title })
    .select("id, title, is_pinned, archived_at, created_at, updated_at")
    .single()

  if (error || !data) return Response.json({ error: "conversation_create_failed" }, { status: 500 })
  return Response.json({ conversation: data }, { status: 201 })
}
