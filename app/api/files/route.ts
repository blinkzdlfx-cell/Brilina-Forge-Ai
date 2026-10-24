import { requireUser } from "@/lib/auth/require-user"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
const BUCKET = "forge-private-files"
const MAX_FILE_BYTES = 10 * 1024 * 1024
const MAX_REQUEST_BYTES = MAX_FILE_BYTES + 1024 * 1024
const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "text/plain",
  "text/markdown",
  "text/x-markdown",
  "text/csv",
  "text/html",
  "application/json",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
])

function safeFilename(value: string) {
  const normalized = value.normalize("NFKC").replace(/[\\/]/g, "_").replace(/[^\p{L}\p{N}._ -]/gu, "_").trim()
  return (normalized || "upload").slice(0, 180)
}

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
  const contentLength = Number(request.headers.get("content-length") ?? 0)
  if (contentLength > MAX_REQUEST_BYTES) return Response.json({ error: "file_too_large" }, { status: 413 })

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return Response.json({ error: "invalid_multipart" }, { status: 400 })
  }
  const file = form.get("file")
  const conversationValue = form.get("conversationId")
  if (!(file instanceof File) || !file.size || file.size > MAX_FILE_BYTES) {
    return Response.json({ error: "invalid_file_size" }, { status: 413 })
  }
  if (!ALLOWED_TYPES.has(file.type)) return Response.json({ error: "unsupported_file_type" }, { status: 415 })

  const conversationId = typeof conversationValue === "string" && conversationValue ? conversationValue : null
  if (conversationId) {
    const { data, error } = await auth.supabase.from("conversations")
      .select("id").eq("id", conversationId).eq("user_id", auth.user.id).maybeSingle()
    if (error || !data) return Response.json({ error: "conversation_not_found" }, { status: 404 })
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  if (!hasExpectedSignature(file.type, bytes)) return Response.json({ error: "file_signature_mismatch" }, { status: 415 })

  const bucket = createAdminClient()
  const storagePath = auth.user.id + "/" + crypto.randomUUID() + "/" + safeFilename(file.name)
  const { error: uploadError } = await bucket.storage.from(BUCKET).upload(storagePath, bytes, {
    contentType: file.type,
    upsert: false,
    cacheControl: "60",
  })
  if (uploadError) return Response.json({ error: "file_upload_failed" }, { status: 502 })

  const { data, error } = await bucket.from("files").insert({
    user_id: auth.user.id,
    conversation_id: conversationId,
    bucket_id: BUCKET,
    storage_path: storagePath,
    original_name: safeFilename(file.name),
    mime_type: file.type,
    size_bytes: file.size,
    status: "uploaded",
  }).select("id, original_name, mime_type, size_bytes, status, created_at").single()

  if (error || !data) {
    await bucket.storage.from(BUCKET).remove([storagePath])
    return Response.json({ error: "file_metadata_save_failed" }, { status: 500 })
  }
  return Response.json({ file: data }, { status: 201 })
}
