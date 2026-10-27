import { requireUser } from "@/lib/auth/require-user"
import { createAdminClient } from "@/lib/supabase/admin"

const BUCKET = "forge-private-audio"
const MAX_AUDIO_BYTES = 20 * 1024 * 1024
const MAX_RECORDING_MS = 10 * 60 * 1000
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ALLOWED_AUDIO_TYPES = new Set([
  "audio/flac", "audio/mp4", "audio/mpeg", "audio/mpga", "audio/ogg",
  "audio/wav", "audio/x-wav", "audio/webm",
])
const EXTENSIONS: Record<string, string> = {
  "audio/flac": "flac", "audio/mp4": "mp4", "audio/mpeg": "mp3",
  "audio/mpga": "mpga", "audio/ogg": "ogg", "audio/wav": "wav",
  "audio/x-wav": "wav", "audio/webm": "webm",
}

export async function POST(request: Request) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response
  let body: unknown
  try { body = await request.json() } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 })
  }
  const input = body && typeof body === "object" ? body as Record<string, unknown> : {}
  const sessionId = typeof input.sessionId === "string" ? input.sessionId : ""
  const mimeType = typeof input.mimeType === "string" ? input.mimeType.split(";")[0].trim().toLowerCase() : ""
  const size = typeof input.size === "number" ? input.size : NaN
  if (!UUID_PATTERN.test(sessionId)) return Response.json({ error: "invalid_recording_session" }, { status: 400 })
  if (!ALLOWED_AUDIO_TYPES.has(mimeType)) return Response.json({ error: "unsupported_audio_type" }, { status: 415 })
  if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_AUDIO_BYTES) {
    return Response.json({ error: "audio_too_large" }, { status: 413 })
  }

  const admin = createAdminClient()
  const { data: session, error } = await admin.from("voice_recording_sessions")
    .select("id, user_id, started_at, stopped_at, expires_at")
    .eq("id", sessionId).eq("user_id", auth.user.id).maybeSingle()
  if (error || !session || !session.stopped_at) return Response.json({ error: "recording_session_unavailable" }, { status: 410 })
  const started = Date.parse(session.started_at)
  const stopped = Date.parse(session.stopped_at)
  if (!Number.isFinite(started) || !Number.isFinite(stopped) || stopped < started || stopped - started > MAX_RECORDING_MS || Date.now() > Date.parse(session.expires_at)) {
    return Response.json({ error: "recording_session_expired" }, { status: 410 })
  }

  const storagePath = [auth.user.id, sessionId, crypto.randomUUID() + "." + EXTENSIONS[mimeType]].join("/")
  const { data: signed, error: signedError } = await admin.storage.from(BUCKET).createSignedUploadUrl(storagePath, { upsert: false })
  if (signedError || !signed?.signedUrl || !signed.token) {
    return Response.json({ error: "audio_upload_initialization_failed" }, { status: 502 })
  }
  return Response.json({ upload: { signedUrl: signed.signedUrl, storagePath }, sizeBytes: size, mimeType }, {
    status: 201,
    headers: { "Cache-Control": "no-store" },
  })
}
