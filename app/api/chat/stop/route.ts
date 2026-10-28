import { requireUser } from "@/lib/auth/require-user"
import { getRedisClient } from "@/lib/redis-client"

type Body = { conversationId?: unknown }
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(request: Request) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  let body: Body
  try {
    body = await request.json() as Body
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 })
  }

  if (typeof body.conversationId !== "string" || !UUID_PATTERN.test(body.conversationId)) {
    return Response.json({ error: "invalid_conversation_id" }, { status: 400 })
  }

  const { data: conversation, error } = await auth.supabase
    .from("conversations")
    .select("active_stream_id, active_generation_status")
    .eq("id", body.conversationId)
    .eq("user_id", auth.user.id)
    .maybeSingle()

  if (error || !conversation) return Response.json({ error: "conversation_not_found" }, { status: 404 })
  if (!conversation.active_stream_id || conversation.active_generation_status !== "running") {
    return Response.json({ success: true, stopped: false })
  }

  try {
    const redis = await getRedisClient()
    if (!redis) return Response.json({ error: "stream_recovery_not_configured" }, { status: 503 })
    await redis.set("forge:stop:" + conversation.active_stream_id, "1", { EX: 120 })
    return Response.json({ success: true, stopped: true })
  } catch {
    return Response.json({ error: "could_not_stop_generation" }, { status: 503 })
  }
}
