import type { User } from "@supabase/supabase-js"

import { createClient } from "@/lib/supabase/server"

export type UserAccess = {
  disabled: boolean
  must_change_password: boolean
}

export type AuthenticatedContext = {
  ok: true
  user: User
  supabase: Awaited<ReturnType<typeof createClient>>
  access: UserAccess
}

export type AuthFailure = {
  ok: false
  response: Response
}

export async function getUserContext(options: { allowMustChange?: boolean } = {}): Promise<AuthenticatedContext | AuthFailure> {
  let supabase: Awaited<ReturnType<typeof createClient>>
  try {
    supabase = await createClient()
  } catch {
    return {
      ok: false,
      response: Response.json({ error: "auth_not_configured" }, { status: 503 }),
    }
  }

  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    return {
      ok: false,
      response: Response.json({ error: "authentication_required" }, { status: 401 }),
    }
  }

  const { data: access, error: accessError } = await supabase
    .from("user_access")
    .select("disabled, must_change_password")
    .eq("user_id", user.id)
    .maybeSingle()

  // Fail closed if the access row is missing or the database cannot be checked.
  if (accessError || !access) {
    return {
      ok: false,
      response: Response.json({ error: "account_access_unavailable" }, { status: 403 }),
    }
  }

  if (access.disabled) {
    await supabase.auth.signOut().catch(() => undefined)
    return {
      ok: false,
      response: Response.json({ error: "account_access_revoked" }, { status: 403 }),
    }
  }

  if (access.must_change_password && !options.allowMustChange) {
    return {
      ok: false,
      response: Response.json({ error: "password_change_required" }, { status: 403 }),
    }
  }

  return { ok: true, user, supabase, access: access as UserAccess }
}

export async function requireUser(options: { allowMustChange?: boolean } = {}) {
  return getUserContext(options)
}

export async function requireOwnerAdmin() {
  const context = await requireUser()
  if (!context.ok) return context

  if (context.user.app_metadata?.role !== "owner") {
    return {
      ok: false as const,
      response: Response.json({ error: "owner_access_required" }, { status: 403 }),
    }
  }

  const { data, error } = await context.supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (error || data?.currentLevel !== "aal2") {
    return {
      ok: false as const,
      response: Response.json({ error: "aal2_required" }, { status: 403 }),
    }
  }

  return context
}
