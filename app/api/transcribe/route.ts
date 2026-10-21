import { getRuntimeEnv } from "@/lib/runtime-env"

const MAX_AUDIO_BYTES = 20 * 1024 * 1024
const MAX_REQUEST_BYTES = MAX_AUDIO_BYTES + 1024 * 1024
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
  // Keep this cost-bearing endpoint off by default while authentication and
  // rate limiting are still being implemented.
  if (getRuntimeEnv("VOICE_TRANSCRIPTION_ENABLED") !== "true") {
    return jsonError("Voice transcription is temporarily disabled.", 503)
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0)
  if (contentLength > MAX_REQUEST_BYTES) {
    return jsonError("Audio must be 20 MB or smaller. Record a shorter message.", 413)
  }

  const accountId = getRuntimeEnv("CLOUDFLARE_ACCOUNT_ID")
  const apiToken = getRuntimeEnv("CLOUDFLARE_AI_API_TOKEN")
  if (!accountId || !apiToken) {
    return jsonError(
      "Voice transcription is not configured. Check the Cloudflare Workers AI credentials.",
      503
    )
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

  let upstream: Response
  try {
    const audio = await file.arrayBuffer()
    upstream = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/openai/whisper`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/octet-stream",
        },
        body: audio,
        signal: AbortSignal.timeout(25_000),
      }
    )
  } catch {
    return jsonError("The transcription service could not be reached. Try again.", 502)
  }

  if (!upstream.ok) {
    if (upstream.status === 401 || upstream.status === 403) {
      return jsonError(
        "Cloudflare rejected the Workers AI credentials. Check the API token permissions.",
        503
      )
    }
    if (upstream.status === 429) {
      return jsonError("The transcription service is busy or its quota is exhausted. Try again later.", 429)
    }
    return jsonError("Transcription failed. Try a shorter recording and try again.", 502)
  }

  let response: { success?: unknown; result?: { text?: unknown } }
  try {
    response = (await upstream.json()) as {
      success?: unknown
      result?: { text?: unknown }
    }
  } catch {
    return jsonError("The transcription service returned an invalid response.", 502)
  }

  if (response.success === false || typeof response.result?.text !== "string") {
    return jsonError("The transcription service returned no transcript.", 502)
  }

  return Response.json({ text: response.result.text })
}
