import { requireUser } from "@/lib/auth/require-user"
import { createAdminClient } from "@/lib/supabase/admin"

const FILE_BUCKET = "forge-private-files"
const AUDIO_BUCKET = "forge-private-audio"
const MAX_FILE_BYTES = 10 * 1024 * 1024
const MAX_AUDIO_BYTES = 20 * 1024 * 1024
const FILE_TYPES = new Set([
  "image/png", "image/jpeg", "image/webp",
  "text/plain", "text/markdown", "text/x-markdown", "text/csv", "text/html", "application/json",
  "application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
])
const AUDIO_TYPES = new Set([
  "audio/flac", "audio/mp4", "audio/mpeg", "audio/mpga", "audio/ogg",
  "audio/wav", "audio/x-wav", "audio/webm",
])
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function safeFilename(value: string) {
  const normalized = value.normalize("NFKC").replace(/[\\/]/g, "_").replace(/[^\p{L}\p{N}._ -]/gu, "_").trim()
  return (normalized || "upload").slice(0, 180)
}

export async function POST(request: Request) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  let input: unknown
  try { input = await request.json() } catch { return Response.json({ error: "invalid_json" }, { status: 400 }) }
  if (!input || typeof input !== "object") return Response.json({ error: "invalid_upload_request" }, { status: 400 })
  const body = input as { name?: unknown; mimeType?: unknown; sizeBytes?: unknown; conversationId?: unknown; kind?: unknown }
  const kind = body.kind === "audio" ? "audio" : "file"
  const bucketId = kind === "audio" ? AUDIO_BUCKET : FILE_BUCKET
  const maxBytes = kind === "audio" ? MAX_AUDIO_BYTES : MAX_FILE_BYTES
  const allowedTypes = kind === "audio" ? AUDIO_TYPES : FILE_TYPES

  if (typeof body.name !== "string" || !body.name.trim() || body.name.length > 255 ||
      typeof body.mimeType !== "string" || !allowedTypes.has(body.mimeType.toLowerCase()) ||
      typeof body.sizeBytes !== "number" || !Number.isSafeInteger(body.sizeBytes) || body.sizeBytes < 1 || body.sizeBytes > maxBytes) {
    return Response.json({ error: kind === "audio" ? "invalid_audio_metadata" : "invalid_file_metadata" }, { status: 400 })
  }

  const conversationId = typeof body.conversationId === "string" && body.conversationId ? body.conversationId : null
  if (conversationId) {
    if (!UUID_PATTERN.test(conversationId)) return Response.json({ error: "conversation_not_found" }, { status: 404 })
    const { data, error } = await auth.supabase.from("conversations").select("id")
      .eq("id", conversationId).eq("user_id", auth.user.id).maybeSingle()
    if (error || !data) return Response.json({ error: "conversation_not_found" }, { status: 404 })
  }

  const admin = createAdminClient()
  const storagePath = auth.user.id + "/" + crypto.randomUUID() + "/" + safeFilename(body.name)
  const { data: signed, error: signedError } = await admin.storage.from(bucketId).createSignedUploadUrl(storagePath, { upsert: false })
  if (signedError || !signed?.token) return Response.json({ error: "upload_intent_unavailable" }, { status: 502 })

  const { data: file, error: metadataError } = await admin.from("files").insert({
    user_id: auth.user.id,
    conversation_id: conversationId,
    bucket_id: bucketId,
    storage_path: storagePath,
    original_name: safeFilename(body.name),
    mime_type: body.mimeType.toLowerCase(),
    size_bytes: body.sizeBytes,
    status: "processing",
  }).select("id, original_name, mime_type, size_bytes, status, created_at").single()

  if (metadataError || !file) {
    await admin.storage.from(bucketId).remove([storagePath]).catch(() => undefined)
    return Response.json({ error: "file_metadata_save_failed" }, { status: 500 })
  }
  return Response.json({ file, bucketId, storagePath, uploadToken: signed.token }, { status: 201 })
}
