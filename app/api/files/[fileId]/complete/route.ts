import { requireUser } from "@/lib/auth/require-user"
import { createAdminClient } from "@/lib/supabase/admin"

const ALLOWED_BUCKETS = new Set(["forge-private-files", "forge-private-audio"])
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(_request: Request, context: { params: Promise<{ fileId: string }> }) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response
  const { fileId } = await context.params
  if (!UUID_PATTERN.test(fileId)) return Response.json({ error: "file_not_found" }, { status: 404 })

  const admin = createAdminClient()
  const { data: file, error } = await admin.from("files")
    .select("id, user_id, bucket_id, storage_path, size_bytes, status")
    .eq("id", fileId).eq("user_id", auth.user.id).maybeSingle()
  if (error || !file || !ALLOWED_BUCKETS.has(file.bucket_id)) return Response.json({ error: "file_not_found" }, { status: 404 })
  if (file.status === "uploaded" || file.status === "ready") return Response.json({ success: true, fileId })
  if (file.status !== "processing") return Response.json({ error: "upload_not_pending" }, { status: 409 })

  const folder = file.storage_path.split("/").slice(0, 2).join("/")
  const filename = file.storage_path.split("/").at(-1)
  if (!filename) return Response.json({ error: "upload_not_found" }, { status: 400 })
  const { data: entries, error: listError } = await admin.storage.from(file.bucket_id).list(folder, { search: filename, limit: 10 })
  const object = entries?.find((entry) => entry.name === filename)
  const actualSize = Number(object?.metadata && typeof object.metadata === "object" ? (object.metadata as { size?: unknown }).size : NaN)
  if (listError || !object || !Number.isFinite(actualSize) || actualSize !== Number(file.size_bytes)) {
    return Response.json({ error: "upload_missing_or_size_mismatch" }, { status: 409 })
  }

  const { error: updateError } = await admin.from("files").update({ status: "uploaded" })
    .eq("id", file.id).eq("user_id", auth.user.id).eq("status", "processing")
  if (updateError) return Response.json({ error: "upload_finalize_failed" }, { status: 500 })
  return Response.json({ success: true, fileId })
}
