import { getCloudflareContext } from "@opennextjs/cloudflare"
import { NextResponse } from "next/server"

import { requireUser } from "@/lib/auth/require-user"
import { createAdminClient } from "@/lib/supabase/admin"
import { getRuntimeEnv } from "@/lib/runtime-env"

const MAX_AUDIO_BYTES = 20 * 1024 * 1024
const MAX_REQUEST_BYTES = MAX_AUDIO_BYTES + 1024
const MAX_RECORDING_MS = 15 * 60 * 1000
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

type WorkersAI = {
  run: (
    model: string,
    input: {
      audio: string
      task: "transcribe"
      vad_filter: boolean
      condition_on_previous_text: boolean
    }
  ) => Promise<{ text?: unknown }>
}

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

  if (getRuntimeEnv("VOICE_TRANSCRIPTION_ENABLED") !== "true") {
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

    if (sessionError || !data) return jsonError("Recording session expired. Start a new recording.", 410)
    session = data as typeof session
  } catch {
    return jsonError("Recording sessions are not configured. Apply the Supabase migrations first.", 503)
  }

  const startedAt = Date.parse(session.started_at)
  const stoppedAt = session.stopped_at ? Date.parse(session.stopped_at) : NaN
  const expiresAt = Date.parse(session.expires_at)
  if (!Number.isFinite(startedAt) || !Number.isFinite(stoppedAt) || !Number.isFinite(expiresAt)) {
    return jsonError("Recording session is invalid. Start a new recording.", 400)
  }
  if (stoppedAt < startedAt || stoppedAt - startedAt > MAX_RECORDING_MS) {
    return jsonError("The recording exceeded the 15-minute limit. Record a shorter message.", 413)
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
  if (attemptError || !attempt) return jsonError("This recording is already being processed. Try again shortly.", 409)

  const contentLength = Number(request.headers.get("content-length") ?? 0)
  if (contentLength > MAX_REQUEST_BYTES) {
    return jsonError("Audio must be 20 MB or smaller. Record a shorter message.", 413)
  }

  const contentType = (request.headers.get("content-type") ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase()
  if (!ALLOWED_AUDIO_TYPES.has(contentType)) {
    return jsonError("This audio format is not supported. Try recording with a current browser.", 415)
  }

  let audio: ArrayBuffer
  try {
    audio = await request.arrayBuffer()
  } catch {
    return jsonError("Invalid audio upload.", 400)
  }

  if (!audio.byteLength) return jsonError("The audio recording is empty.", 400)
  if (audio.byteLength > MAX_AUDIO_BYTES) {
    return jsonError("Audio must be 20 MB or smaller. Record a shorter message.", 413)
  }

  let ai: WorkersAI | undefined
  try {
    const env = getCloudflareContext().env as unknown as { AI?: WorkersAI }
    ai = env.AI
  } catch {
    // Next.js local dev has no Workers AI binding unless running under Wrangler.
  }

  if (!ai) {
    return jsonError("Workers AI is not available in this runtime. Check the Cloudflare AI binding.", 503)
  }

  try {
    const result = await ai.run("@cf/openai/whisper-large-v3-turbo", {
      audio: toBase64(new Uint8Array(audio)),
      task: "transcribe",
      vad_filter: true,
      condition_on_previous_text: false,
    })

    if (typeof result.text !== "string") {
      return jsonError("The transcription service returned no transcript.", 502)
    }

    return NextResponse.json({ text: result.text.trim() })
  } catch (error) {
    const message = error instanceof Error ? error.message : ""
    if (/429|quota|rate.?limit/i.test(message)) {
      return jsonError("The transcription service is busy or its quota is exhausted. Try again later.", 429)
    }
    return jsonError("Transcription failed. Try a shorter recording and try again.", 502)
  }
}
