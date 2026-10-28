import { requireUser } from "@/lib/auth/require-user"
import { DEFAULT_PERSONALIZATION, normalizePersonalization } from "@/lib/personalization"

export async function GET() {
  const auth = await requireUser()
  if (!auth.ok) return auth.response
  return Response.json({
    preferences: normalizePersonalization(auth.user.user_metadata?.forge_preferences ?? DEFAULT_PERSONALIZATION),
  })
}

export async function PATCH(request: Request) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 })
  }

  const raw = body && typeof body === "object" ? (body as { preferences?: unknown }).preferences : null
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return Response.json({ error: "invalid_preferences" }, { status: 400 })
  }

  const preferences = normalizePersonalization(raw)
  const { error } = await auth.supabase.auth.updateUser({
    data: { forge_preferences: preferences },
  })
  if (error) return Response.json({ error: "preferences_save_failed" }, { status: 500 })
  return Response.json({ preferences })
}
