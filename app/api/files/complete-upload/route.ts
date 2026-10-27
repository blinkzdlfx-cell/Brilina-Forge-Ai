import { requireUser } from "@/lib/auth/require-user"
import { createAdminClient } from "@/lib/supabase/admin"

const BUCKET = "forge-private-files"
const MAX_FILE_BYTES = 10 * 1024 * 1024
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ALLOWED_TYPES = new Set([
  "image/png", "image/jpeg", "image/webp", "text/plain", "text/markdown",
  "text/x-markdown", "text/csv", "text/html", "application/json",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
])

function hasExpectedSignature(type: string, bytes: Uint8Array) {
  if (type === "application/pdf") return bytes.length >= 5 && new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-"
  if (type === "image/png") return bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)
  if (type === "image/jpeg") return bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
  if (type === "image/webp") return bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP"
  if (type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return bytes.length >= 4 && bytes[0] === 80 && bytes[1] === 75 && bytes[2] === 3 && bytes[3] === 4
  return true
}

export async function POST(request: Request) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  let body: unknown
  try { body = await request.json() } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 })
  }
  const input = body && typeof body === "object" ? body as Record<string, unknown> : {}
  const storagePath = typeof input.storagePath === "string" ? input.storagePath : ""
  const name = typeof input.name === "string" ? input.name : ""
  const mimeType = typeof input.mimeType === "string" ? input.mimeType.toLowerCase() : ""
  const size = typeof input.size === "number" ? input.size : NaN
  const conversationId = typeof input.conversationId === "string" ? input.conversationId : null

  const segments = storagePath.split("/")
  if (segments.length !== 3 || segments[0] !== auth.user.id || !UUID_PATTERN.test(segments[1]) || !segments[2]) {
    return Response.json({ error: "invalid_upload_reference" }, { status: 400 })
  }
  if (!name.trim() || name.length > 255 || !Number.isSafeInteger(size) || size <= 0 || size > MAX_FILE_BYTES) {
    return Response.json({ error: "invalid_file_size" }, { status: 413 })
  }
  if (!ALLOWED_TYPES.has(mimeType)) return Response.json({ error: "unsupported_file_type" }, { status: 415 })
  if (conversationId) {
    if (!UUID_PATTERN.test(conversationId)) return Response.json({ error: "conversation_not_found" }, { status: 404 })
    const { data, error } = await auth.supabase.from("conversations").select("id")
      .eq("id", conversationId).eq("user_id", auth.user.id).maybeSingle()
    if (error || !data) return Response.json({ error: "conversation_not_found" }, { status: 404 })
  }

  const admin = createAdminClient()
  const { data: object, error: downloadError } = await admin.storage.from(BUCKET).download(storagePath)
  if (downloadError || !object) return Response.json({ error: "uploaded_object_not_found" }, { status: 404 })
  if (object.size !== size || object.size > MAX_FILE_BYTES) {
    await admin.storage.from(BUCKET).remove([storagePath])
    return Response.json({ error: "uploaded_size_mismatch" }, { status: 413 })
  }
  const bytes = new Uint8Array(await object.arrayBuffer())
  if (bytes.byteLength !== size || !hasExpectedSignature(mimeType, bytes)) {
    await admin.storage.from(BUCKET).remove([storagePath])
    return Response.json({ error: "file_signature_mismatch" }, { status: 415 })
  }

  const safeName = name.normalize("NFKC").replace(/[\\/]/g, "_").replace(/[^\p{L}\p{N}._ -]/gu, "_").trim().slice(0, 180) || "upload"
  const { data: file, error: metadataError } = await admin.from("files").insert({
    user_id: auth.user.id,
    conversation_id: conversationId,
    bucket_id: BUCKET,
    storage_path: storagePath,
    original_name: safeName,
    mime_type: mimeType,
    size_bytes: size,
    status: "uploaded",
  }).select("id, original_name, mime_type, size_bytes, status, created_at").single()

  if (metadataError || !file) {
    await admin.storage.from(BUCKET).remove([storagePath])
    return Response.json({ error: "file_metadata_save_failed" }, { status: 500 })
  }
  return Response.json({ file }, { status: 201, headers: { "Cache-Control": "no-store" } })
}
