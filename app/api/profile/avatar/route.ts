import { requireUser } from "@/lib/auth/require-user"
import { createAdminClient } from "@/lib/supabase/admin"

const BUCKET = "forge-private-files"
const MAX_AVATAR_BYTES = 2 * 1024 * 1024
const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
}

export async function GET() {
  const auth = await requireUser()
  if (!auth.ok) return auth.response
  const avatarPath = typeof auth.user.user_metadata?.avatar_path === "string" ? auth.user.user_metadata.avatar_path : ""
  let url = ""
  if (avatarPath && avatarPath.startsWith(auth.user.id + "/profile/")) {
    const admin = createAdminClient()
    const { data } = await admin.storage.from(BUCKET).createSignedUrl(avatarPath, 60 * 60)
    url = data?.signedUrl ?? ""
  }
  return Response.json({ url, email: auth.user.email ?? "" })
}

export async function POST(request: Request) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return Response.json({ error: "invalid_upload" }, { status: 400 })
  }
  const file = form.get("avatar")
  if (!(file instanceof File)) return Response.json({ error: "choose_an_image" }, { status: 400 })
  const extension = MIME_EXTENSIONS[file.type]
  if (!extension) return Response.json({ error: "Use a PNG, JPEG, or WebP image." }, { status: 415 })
  if (file.size < 1 || file.size > MAX_AVATAR_BYTES) return Response.json({ error: "Profile photos must be 2 MiB or smaller." }, { status: 413 })

  const admin = createAdminClient()
  const previousPath = typeof auth.user.user_metadata?.avatar_path === "string" ? auth.user.user_metadata.avatar_path : ""
  const path = auth.user.id + "/profile/" + crypto.randomUUID() + "." + extension
  const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    cacheControl: "3600",
    upsert: false,
  })
  if (uploadError) return Response.json({ error: "profile_photo_upload_failed" }, { status: 502 })

  const { error: metadataError } = await auth.supabase.auth.updateUser({ data: { avatar_path: path } })
  if (metadataError) {
    await admin.storage.from(BUCKET).remove([path])
    return Response.json({ error: "profile_photo_save_failed" }, { status: 500 })
  }
  if (previousPath && previousPath.startsWith(auth.user.id + "/profile/")) {
    await admin.storage.from(BUCKET).remove([previousPath]).catch(() => undefined)
  }
  const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(path, 60 * 60)
  return Response.json({ url: signed?.signedUrl ?? "" })
}
