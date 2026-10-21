import { getCloudflareContext } from "@opennextjs/cloudflare"
import { getRuntimeEnv } from "@/lib/runtime-env"

const MAX_AUDIO_BYTES = 20 * 1024 * 1024
const MAX_REQUEST_BYTES = MAX_AUDIO_BYTES + 1024
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
  return Response.json({ error: message }, { status })
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
  if (getRuntimeEnv("VOICE_TRANSCRIPTION_ENABLED") !== "true") {
    return jsonError("Voice transcription is temporarily disabled.", 503)
  }

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

    return Response.json({ text: result.text.trim() })
  } catch (error) {
    const message = error instanceof Error ? error.message : ""
    if (/429|quota|rate.?limit/i.test(message)) {
      return jsonError("The transcription service is busy or its quota is exhausted. Try again later.", 429)
    }
    return jsonError("Transcription failed. Try a shorter recording and try again.", 502)
  }
}
