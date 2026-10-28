import { requireUser } from "@/lib/auth/require-user"
import { createAdminClient } from "@/lib/supabase/admin"
import { DEFAULT_MODEL, isModelAllowed } from "@/lib/models"
import { getRuntimeEnv } from "@/lib/runtime-env"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_PROMPT_LENGTH = 12_000

async function addEvent(admin: ReturnType<typeof createAdminClient>, event: {
  job_id: string; user_id: string; stage: string; message: string; progress: number; details?: Record<string, unknown>
}) {
  await admin.from("background_job_events").insert({
    ...event,
    details: event.details ?? {},
  })
}

export async function POST(request: Request) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  let body: unknown
  try { body = await request.json() } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 })
  }
  const input = body && typeof body === "object" ? body as Record<string, unknown> : {}
  const prompt = typeof input.prompt === "string" ? input.prompt.trim() : ""
  const conversationId = typeof input.conversationId === "string" ? input.conversationId : null
  const model = typeof input.model === "string" && isModelAllowed(input.model) ? input.model : DEFAULT_MODEL
  const idempotencyKey = typeof input.idempotencyKey === "string" && input.idempotencyKey.length <= 120 ? input.idempotencyKey : null

  if (!prompt || prompt.length > MAX_PROMPT_LENGTH) {
    return Response.json({ error: "prompt_must_be_between_1_and_12000_characters" }, { status: 400 })
  }
  if (!conversationId || !UUID_PATTERN.test(conversationId)) {
    return Response.json({ error: "a_valid_conversation_id_is_required" }, { status: 400 })
  }

  const admin = createAdminClient()
  if (conversationId) {
    const { data: ownedConversation, error } = await auth.supabase.from("conversations")
      .select("id").eq("id", conversationId).eq("user_id", auth.user.id).maybeSingle()
    if (error || !ownedConversation) return Response.json({ error: "conversation_not_found" }, { status: 404 })
  }

  if (idempotencyKey) {
    const { data: existing } = await admin.from("background_jobs").select("id,status,progress,stage,progress_message")
      .eq("user_id", auth.user.id).eq("idempotency_key", idempotencyKey).maybeSingle()
    if (existing) return Response.json({ job: existing, reused: true }, { status: 200 })
  }

  const userMessageId = crypto.randomUUID()
  const { data: job, error: createError } = await admin.from("background_jobs").insert({
    user_id: auth.user.id,
    conversation_id: conversationId,
    task_type: "assistant_task",
    status: "queued",
    progress: 0,
    stage: "queued",
    progress_message: "Task queued. Preparing the background worker.",
    input: { prompt, model, userMessageId },
    idempotency_key: idempotencyKey,
  }).select("id,status,progress,stage,progress_message,created_at").single()

  if (createError || !job) {
    return Response.json({ error: "background_job_create_failed" }, { status: 500 })
  }

  const { data: latestMessages, error: latestMessagesError } = await admin.from("messages")
    .select("sequence_number").eq("conversation_id", conversationId)
    .order("sequence_number", { ascending: false }).limit(1)
  if (latestMessagesError) {
    await admin.from("background_jobs").update({ status: "failed", stage: "persistence", error_code: "message_sequence_lookup_failed", error_message: "Could not prepare the conversation for the background task.", completed_at: new Date().toISOString() }).eq("id", job.id)
    return Response.json({ error: "conversation_message_prepare_failed", jobId: job.id }, { status: 500 })
  }
  const { error: userMessageError } = await admin.from("messages").insert({
    id: crypto.randomUUID(), conversation_id: conversationId, role: "user",
    parts: [{ type: "text", text: prompt }],
    sequence_number: Number(latestMessages?.[0]?.sequence_number ?? -1) + 1,
    status: "complete", client_message_id: userMessageId,
    turn_message_id: userMessageId, version_number: 1, is_active_version: true,
  })
  if (userMessageError) {
    await admin.from("background_jobs").update({ status: "failed", stage: "persistence", error_code: "user_message_save_failed", error_message: "Could not save the task prompt to conversation history.", completed_at: new Date().toISOString() }).eq("id", job.id)
    return Response.json({ error: "conversation_message_save_failed", jobId: job.id }, { status: 500 })
  }
  await admin.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId).eq("user_id", auth.user.id)
  await addEvent(admin, {
    job_id: job.id, user_id: auth.user.id, stage: "queued",
    message: "Task queued. Preparing the background worker.", progress: 0,
  })

  const workerUrl = getRuntimeEnv("NETLIFY_BACKGROUND_FUNCTION_URL")
  const workerSecret = getRuntimeEnv("NETLIFY_WORKER_SECRET")
  if (!workerUrl || !workerSecret) {
    const message = "Background processing is not configured yet. Add NETLIFY_BACKGROUND_FUNCTION_URL and NETLIFY_WORKER_SECRET to the Vercel environment, then retry."
    await admin.from("background_jobs").update({
      status: "failed", stage: "configuration", progress_message: message,
      error_code: "worker_not_configured", error_message: message, completed_at: new Date().toISOString(),
    }).eq("id", job.id).eq("user_id", auth.user.id)
    await addEvent(admin, {
      job_id: job.id, user_id: auth.user.id, stage: "configuration", message, progress: 0,
    })
    return Response.json({ error: message, jobId: job.id }, { status: 503 })
  }

  try {
    const response = await fetch(workerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forge-worker-secret": workerSecret },
      body: JSON.stringify({ jobId: job.id }),
      signal: AbortSignal.timeout(8_000),
    })
    if (!response.ok && response.status !== 202) {
      throw new Error("The Netlify worker rejected the job with HTTP " + response.status + ".")
    }
  } catch {
    const message = "The background worker could not be reached. The task was saved and can be retried."
    await admin.from("background_jobs").update({
      status: "failed", stage: "dispatch", progress_message: message,
      error_code: "worker_dispatch_failed", error_message: message, completed_at: new Date().toISOString(),
    }).eq("id", job.id).eq("user_id", auth.user.id)
    await addEvent(admin, {
      job_id: job.id, user_id: auth.user.id, stage: "dispatch", message, progress: 0,
    })
    return Response.json({ error: message, jobId: job.id }, { status: 502 })
  }

  await admin.from("background_jobs").update({
    status: "queued", stage: "accepted", progress_message: "Netlify accepted the task. Waiting for execution.",
  }).eq("id", job.id).eq("user_id", auth.user.id)
  await addEvent(admin, {
    job_id: job.id, user_id: auth.user.id, stage: "accepted",
    message: "Netlify accepted the task. Waiting for execution.", progress: 1,
  })

  return Response.json({ job: { ...job, stage: "accepted", progress_message: "Netlify accepted the task. Waiting for execution." }, userMessage: { id: userMessageId, role: "user", parts: [{ type: "text", text: prompt }] } }, { status: 202 })
}
