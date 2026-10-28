import { UI_MESSAGE_STREAM_HEADERS } from "ai"

import { requireUser } from "@/lib/auth/require-user"
import { getResumableStreamContext } from "@/lib/resumable-stream-context"

type RouteContext = { params: Promise<{ id: string }> }
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const { id } = await context.params
  if (!UUID_PATTERN.test(id)) return new Response(null, { status: 204 })

  const { data: conversation, error } = await auth.supabase
    .from("conversations")
    .select("active_stream_id, active_generation_status")
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .maybeSingle()

  if (error || !conversation) return new Response(null, { status: 204 })
  if (conversation.active_generation_status !== "running" || !conversation.active_stream_id) {
    return new Response(null, { status: 204 })
  }

  let streamContext
  try {
    streamContext = await getResumableStreamContext()
  } catch {
    return new Response(null, { status: 204 })
  }
  if (!streamContext) return new Response(null, { status: 204 })

  try {
    const stream = await streamContext.resumeExistingStream(conversation.active_stream_id)
    if (!stream) return new Response(null, { status: 204 })
    return new Response(stream, {
      status: 200,
      headers: {
        ...UI_MESSAGE_STREAM_HEADERS,
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    })
  } catch {
    return new Response(null, { status: 204 })
  }
}
