import { getRuntimeEnv } from "@/lib/runtime-env"

export const runtime = "edge"

const MAX_AUDIO_BYTES = 20 * 1024 * 1024
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

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status })
}

export async function POST(request: Request) {
  const apiKey = getRuntimeEnv("OPENAI_API_KEY")
  if (!apiKey) {
    return jsonError("Voice transcription is not configured yet. Add the OPENAI_API_KEY secret.", 503)
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return jsonError("Invalid audio upload.", 400)
  }

  const file = formData.get("file")
  if (!(file instanceof File)) {
    return jsonError("Choose a voice recording to transcribe.", 400)
  }

  if (file.size === 0) {
    return jsonError("The audio recording is empty.", 400)
  }
  if (file.size > MAX_AUDIO_BYTES) {
    return jsonError("Audio must be 20 MB or smaller. Record a shorter message.", 413)
  }

  const contentType = file.type.split(";")[0].trim().toLowerCase()
  if (!ALLOWED_AUDIO_TYPES.has(contentType)) {
    return jsonError("This audio format is not supported. Try recording with a current browser.", 415)
  }

  const upstreamForm = new FormData()
  upstreamForm.append("file", file, file.name || "recording.webm")
  upstreamForm.append("model", "whisper-1")
  upstreamForm.append("response_format", "json")

  let upstream: Response
  try {
    upstream = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: upstreamForm,
      signal: AbortSignal.timeout(25_000),
    })
  } catch {
    return jsonError("The transcription service could not be reached. Try again.", 502)
  }

  if (!upstream.ok) {
    // Do not return upstream error bodies; they may contain implementation details.
    if (upstream.status === 401 || upstream.status === 403) {
      return jsonError("The OpenAI API key was rejected. Check the OPENAI_API_KEY secret.", 503)
    }
    if (upstream.status === 429) {
      return jsonError("The transcription service is busy or its quota is exhausted. Try again later.", 429)
    }
    return jsonError("Transcription failed. Try a shorter recording and try again.", 502)
  }

  let result: { text?: unknown }
  try {
    result = (await upstream.json()) as { text?: unknown }
  } catch {
    return jsonError("The transcription service returned an invalid response.", 502)
  }

  if (typeof result.text !== "string") {
    return jsonError("The transcription service returned no transcript.", 502)
  }

  return Response.json({ text: result.text })
}
