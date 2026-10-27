import { NextResponse } from "next/server"

import { requireUser } from "@/lib/auth/require-user"
import { createAdminClient } from "@/lib/supabase/admin"
import { getRuntimeEnv } from "@/lib/runtime-env"
import { recordSecureDiagnostic } from "@/lib/secure-diagnostic"

const MAX_AUDIO_BYTES = 20 * 1024 * 1024
const MAX_REQUEST_BYTES = MAX_AUDIO_BYTES + 1024
const MAX_RECORDING_MS = 10 * 60 * 1000
const MAX_RETRY_AGE_MS = 5 * 60 * 1000
const ALLOWED_AUDIO_TYPES = new Set([
  "audio/flac",
  "audio/mp4",
  "audio/mpeg",
  "audio/mpga",
  "audio/ogg",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
])
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

function toBase64(bytes: Uint8Array) {
  let binary = ""
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

export async function POST(request: Request) {
  const context = await requireUser()
  if (!context.ok) return context.response
  const requestId = crypto.randomUUID()

  if (getRuntimeEnv("VOICE_TRANSCRIPTION_ENABLED") !== "true") {
    await recordSecureDiagnostic({ event: "transcription_request_rejected", route: "/api/transcribe", userId: context.user.id, requestId, statusCode: 503, details: { stage: "configuration", reason: "voice_transcription_disabled", configurationPresent: false } })
    return jsonError("Voice transcription is temporarily disabled.", 503)
  }

  const sessionId = request.headers.get("x-recording-session") ?? ""
  if (!UUID_PATTERN.test(sessionId)) {
    return jsonError("Start a new recording session before transcribing audio.", 400)
  }

  const now = Date.now()
  let admin
  let session: {
    id: string
    user_id: string
    started_at: string
    stopped_at: string | null
    expires_at: string
    attempt_count: number
  }
  try {
    admin = createAdminClient()
    const { data, error: sessionError } = await admin
      .from("voice_recording_sessions")
      .select("id, user_id, started_at, stopped_at, expires_at, attempt_count")
      .eq("id", sessionId)
      .eq("user_id", context.user.id)
      .maybeSingle()

    if (sessionError || !data) {
      await recordSecureDiagnostic({ event: "transcription_session_lookup_failed", level: "warning", route: "/api/transcribe", userId: context.user.id, requestId, statusCode: 410, details: { stage: "session_lookup", databaseErrorCode: sessionError?.code ?? null, foundSession: Boolean(data) } })
      return jsonError("Recording session expired. Start a new recording.", 410)
    }
    session = data as typeof session
  } catch (caught) {
    await recordSecureDiagnostic({ event: "transcription_session_lookup_unavailable", route: "/api/transcribe", userId: context.user.id, requestId, statusCode: 503, details: { stage: "session_lookup", errorClass: caught instanceof Error ? caught.name : "unknown" } })
    return jsonError("Recording sessions are not configured. Apply the Supabase migrations first.", 503)
  }

  const startedAt = Date.parse(session.started_at)
  const stoppedAt = session.stopped_at ? Date.parse(session.stopped_at) : NaN
  const expiresAt = Date.parse(session.expires_at)
  if (!Number.isFinite(startedAt) || !Number.isFinite(stoppedAt) || !Number.isFinite(expiresAt)) {
    return jsonError("Recording session is invalid. Start a new recording.", 400)
  }
  if (stoppedAt < startedAt || stoppedAt - startedAt > MAX_RECORDING_MS) {
    return jsonError("The recording exceeded the 10-minute limit. Record a shorter message.", 413)
  }
  if (now > expiresAt || now - stoppedAt > MAX_RETRY_AGE_MS) {
    return jsonError("The recording session expired. Start a new recording.", 410)
  }
  if (session.attempt_count >= 2) {
    return jsonError("This recording has reached its retry limit. Record a new message.", 429)
  }

  // Optimistic increment allows one initial attempt and one retry without
  // permitting concurrent duplicate requests to exceed the retry budget.
  const { data: attempt, error: attemptError } = await admin
    .from("voice_recording_sessions")
    .update({ attempt_count: session.attempt_count + 1 })
    .eq("id", session.id)
    .eq("user_id", context.user.id)
    .eq("attempt_count", session.attempt_count)
    .select("id")
    .maybeSingle()
  if (attemptError || !attempt) {
    await recordSecureDiagnostic({ event: "transcription_attempt_reservation_failed", level: "warning", route: "/api/transcribe", userId: context.user.id, requestId, statusCode: 409, details: { stage: "attempt_reservation", databaseErrorCode: attemptError?.code ?? null, returnedData: Boolean(attempt) } })
    return jsonError("This recording is already being processed. Try again shortly.", 409)
  }

  let audio: ArrayBuffer
  let contentType = ""
  let audioStoragePath: string | null = null
  const incomingType = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase()

  if (incomingType === "application/json") {
    let body: unknown
    try { body = await request.json() } catch { return jsonError("Invalid audio reference.", 400) }
    const input = body && typeof body === "object" ? body as Record<string, unknown> : {}
    const storagePath = typeof input.storagePath === "string" ? input.storagePath : ""
    contentType = typeof input.mimeType === "string" ? input.mimeType.toLowerCase() : ""
    const declaredSize = typeof input.size === "number" ? input.size : NaN
    const pathParts = storagePath.split("/")
    if (pathParts.length !== 3 || pathParts[0] !== context.user.id || pathParts[1] !== session.id || !UUID_PATTERN.test(pathParts[1]) || !/^[0-9a-f-]{36}\.(flac|mp4|mp3|mpga|ogg|wav|webm)$/i.test(pathParts[2])) {
      return jsonError("Audio upload reference is invalid.", 400)
    }
    if (!ALLOWED_AUDIO_TYPES.has(contentType) || !Number.isSafeInteger(declaredSize) || declaredSize <= 0 || declaredSize > MAX_AUDIO_BYTES) {
      return jsonError("Audio upload metadata is invalid.", 400)
    }
    const { data: object, error: downloadError } = await admin.storage.from("forge-private-audio").download(storagePath)
    if (downloadError || !object) return jsonError("Uploaded audio could not be found. Upload it again.", 404)
    if (object.size !== declaredSize || object.size > MAX_AUDIO_BYTES) {
      await admin.storage.from("forge-private-audio").remove([storagePath])
      return jsonError("Audio must be 20 MB or smaller. Record a shorter message.", 413)
    }
    audio = await object.arrayBuffer()
    audioStoragePath = storagePath
  } else {
    const contentLength = Number(request.headers.get("content-length") ?? 0)
    if (contentLength > MAX_REQUEST_BYTES) return jsonError("Audio must be 20 MB or smaller. Record a shorter message.", 413)
    contentType = incomingType
    if (!ALLOWED_AUDIO_TYPES.has(contentType)) {
      return jsonError("This audio format is not supported. Try recording with a current browser.", 415)
    }
    try { audio = await request.arrayBuffer() } catch { return jsonError("Invalid audio upload.", 400) }
  }

  if (!audio.byteLength) return jsonError("The audio recording is empty.", 400)
  if (audio.byteLength > MAX_AUDIO_BYTES) return jsonError("Audio must be 20 MB or smaller. Record a shorter message.", 413)

  const accountId = getRuntimeEnv("CLOUDFLARE_ACCOUNT_ID")
  const apiToken = getRuntimeEnv("CLOUDFLARE_AI_API_TOKEN")
  if (!accountId || !apiToken) {
    await recordSecureDiagnostic({ event: "transcription_provider_not_configured", route: "/api/transcribe", userId: context.user.id, requestId, statusCode: 503, details: { stage: "provider_configuration", accountIdPresent: Boolean(accountId), tokenPresent: Boolean(apiToken) } })
    return jsonError("The transcription service is not configured.", 503)
  }

  try {
    const providerResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/openai/whisper-large-v3-turbo`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          audio: toBase64(new Uint8Array(audio)),
          task: "transcribe",
          vad_filter: true,
          condition_on_previous_text: false,
        }),
        signal: AbortSignal.timeout(120_000),
      }
    )
    const providerPayload: unknown = await providerResponse.json().catch(() => null)
    const result =
      providerPayload && typeof providerPayload === "object" && "result" in providerPayload
        ? (providerPayload as { result?: { text?: unknown } }).result
        : undefined

    if (!providerResponse.ok) {
      const providerStatus = providerResponse.status
      const rateLimited = providerStatus === 429
      await recordSecureDiagnostic({ event: "transcription_provider_failed", route: "/api/transcribe", userId: context.user.id, requestId, statusCode: rateLimited ? 429 : 502, details: { stage: "cloudflare_ai_rest", providerStatus } })
      if (rateLimited) {
        return jsonError("The transcription service is busy or its quota is exhausted. Try again later.", 429)
      }
      return jsonError("Transcription failed. Try again with a shorter recording.", 502)
    }

    if (typeof result?.text !== "string") {
      await recordSecureDiagnostic({ event: "transcription_provider_empty_result", route: "/api/transcribe", userId: context.user.id, requestId, statusCode: 502, details: { stage: "workers_ai_result", provider: "workers_ai_whisper" } })
      return jsonError("The transcription service returned no transcript.", 502)
    }

    const { error: cleanupError } = await admin.from("voice_recording_sessions").delete().eq("id", session.id).eq("user_id", context.user.id)
    if (cleanupError) {
      await recordSecureDiagnostic({ event: "transcription_session_cleanup_failed", level: "warning", route: "/api/transcribe", userId: context.user.id, requestId, statusCode: 200, details: { stage: "session_cleanup", databaseErrorCode: cleanupError.code ?? null } })
    }
    return NextResponse.json({ text: result.text.trim() })
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || /timeout/i.test(error.message))
    await recordSecureDiagnostic({ event: "transcription_provider_failed", route: "/api/transcribe", userId: context.user.id, requestId, statusCode: timedOut ? 504 : 502, details: { stage: "cloudflare_ai_rest", errorClass: error instanceof Error ? error.name.slice(0, 60) : "unknown" } })
    if (timedOut) {
      return jsonError("Transcription took too long. Try a shorter recording.", 504)
    }
    return jsonError("Transcription failed. Try a shorter recording and try again.", 502)
  }
}
