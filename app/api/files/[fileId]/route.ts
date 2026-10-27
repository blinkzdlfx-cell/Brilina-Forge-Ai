import { requireUser } from "@/lib/auth/require-user"
import { createAdminClient } from "@/lib/supabase/admin"

const ALLOWED_BUCKETS = new Set(["forge-private-files", "forge-private-audio"])
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function GET(_request: Request, context: { params: Promise<{ fileId: string }> }) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response
  const { fileId } = await context.params
  if (!UUID_PATTERN.test(fileId)) return Response.json({ error: "file_not_found" }, { status: 404 })

  const admin = createAdminClient()
  const { data: file, error } = await admin.from("files")
    .select("id, user_id, bucket_id, storage_path, original_name, mime_type, size_bytes, status")
    .eq("id", fileId).eq("user_id", auth.user.id).maybeSingle()
  if (error || !file || !ALLOWED_BUCKETS.has(file.bucket_id)) return Response.json({ error: "file_not_found" }, { status: 404 })

  const { data, error: signedError } = await admin.storage.from(file.bucket_id).createSignedUrl(file.storage_path, 60)
  if (signedError || !data?.signedUrl) return Response.json({ error: "file_access_unavailable" }, { status: 502 })
  return Response.json({ file: { id: file.id, name: file.original_name, mimeType: file.mime_type, sizeBytes: file.size_bytes, status: file.status }, signedUrl: data.signedUrl, expiresInSeconds: 60 })
}

export async function DELETE(_request: Request, context: { params: Promise<{ fileId: string }> }) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response
  const { fileId } = await context.params
  if (!UUID_PATTERN.test(fileId)) return Response.json({ error: "file_not_found" }, { status: 404 })

  const admin = createAdminClient()
  const { data: file, error } = await admin.from("files")
    .select("id, bucket_id, storage_path")
    .eq("id", fileId).eq("user_id", auth.user.id).maybeSingle()
  if (error || !file || !ALLOWED_BUCKETS.has(file.bucket_id)) return Response.json({ error: "file_not_found" }, { status: 404 })

  const { error: storageError } = await admin.storage.from(file.bucket_id).remove([file.storage_path])
  if (storageError) return Response.json({ error: "file_delete_failed" }, { status: 502 })
  const { error: metadataError } = await admin.from("files").delete().eq("id", fileId).eq("user_id", auth.user.id)
  if (metadataError) return Response.json({ error: "file_metadata_delete_failed" }, { status: 500 })
  return Response.json({ success: true, id: fileId })
}
