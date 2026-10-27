import { requireUser } from "@/lib/auth/require-user"
import { createAdminClient } from "@/lib/supabase/admin"

const BUCKET = "forge-private-files"
const MAX_FILE_BYTES = 10 * 1024 * 1024
const ALLOWED_TYPES = new Set([
  "image/png", "image/jpeg", "image/webp", "text/plain", "text/markdown",
  "text/x-markdown", "text/csv", "text/html", "application/json",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
])
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function safeFilename(value: string) {
  const normalized = value.normalize("NFKC").replace(/[\\/]/g, "_").replace(/[^\p{L}\p{N}._ -]/gu, "_").trim()
  return (normalized || "upload").slice(0, 180)
}

export async function POST(request: Request) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  let body: unknown
  try { body = await request.json() } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 })
  }
  const input = body && typeof body === "object" ? body as Record<string, unknown> : {}
  const name = typeof input.name === "string" ? input.name : ""
  const mimeType = typeof input.mimeType === "string" ? input.mimeType.toLowerCase() : ""
  const size = typeof input.size === "number" ? input.size : NaN
  const conversationId = typeof input.conversationId === "string" ? input.conversationId : null

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

  const storagePath = auth.user.id + "/" + crypto.randomUUID() + "/" + safeFilename(name)
  const admin = createAdminClient()
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(storagePath, { upsert: false })
  if (error || !data?.signedUrl || !data.token) {
    return Response.json({ error: "file_upload_initialization_failed" }, { status: 502 })
  }
  return Response.json({
    upload: { signedUrl: data.signedUrl, token: data.token, bucket: BUCKET, storagePath },
    metadata: { name: safeFilename(name), mimeType, sizeBytes: size, conversationId },
  }, { status: 201, headers: { "Cache-Control": "no-store" } })
}
