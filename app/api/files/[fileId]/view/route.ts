import { requireUser } from "@/lib/auth/require-user"
import { createAdminClient } from "@/lib/supabase/admin"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const BUCKET = "forge-private-files"

export async function GET(_request: Request, context: { params: Promise<{ fileId: string }> }) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response
  const { fileId } = await context.params
  if (!UUID_PATTERN.test(fileId)) return Response.json({ error: "file_not_found" }, { status: 404 })

  const admin = createAdminClient()
  const { data: file, error } = await admin.from("files")
    .select("id, user_id, bucket_id, storage_path, mime_type, status")
    .eq("id", fileId).eq("user_id", auth.user.id).maybeSingle()
  if (error || !file || file.bucket_id !== BUCKET || !["uploaded", "ready"].includes(file.status)) {
    return Response.json({ error: "file_not_found" }, { status: 404 })
  }
  const { data, error: signedError } = await admin.storage.from(BUCKET).createSignedUrl(file.storage_path, 5 * 60, { download: false })
  if (signedError || !data?.signedUrl) return Response.json({ error: "file_view_unavailable" }, { status: 502 })
  return Response.redirect(data.signedUrl, 302)
}
