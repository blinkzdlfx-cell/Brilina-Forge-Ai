import { NextResponse } from "next/server"

import { checkRateLimit } from "@/lib/auth/rate-limit"
import { requireOwnerAdmin } from "@/lib/auth/require-user"
import { createAdminClient } from "@/lib/supabase/admin"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function badRequest(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  const length = Number(request.headers.get("content-length") ?? 0)
  if (length > 16 * 1024) return null
  try {
    const body = await request.json()
    return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : null
  } catch {
    return null
  }
}

function rateLimit(ownerId: string) {
  return checkRateLimit(`admin:${ownerId}`, 30, 60 * 1000)
}

export async function GET() {
  const context = await requireOwnerAdmin()
  if (!context.ok) return context.response
  const rate = rateLimit(context.user.id)
  if (!rate.allowed) return badRequest("Too many admin requests. Try again shortly.", 429)

  try {
    const admin = createAdminClient()
    const [{ data: users, error: usersError }, { data: accessRows, error: accessError }] = await Promise.all([
      admin.auth.admin.listUsers({ page: 1, perPage: 200 }),
      admin.from("user_access").select("user_id, disabled, must_change_password"),
    ])
    if (usersError || accessError) return badRequest("Could not load users.", 503)

    const accessById = new Map((accessRows ?? []).map((row) => [row.user_id, row]))
    const result = (users?.users ?? []).map((user) => {
      const access = accessById.get(user.id)
      return {
        id: user.id,
        email: user.email ?? "",
        createdAt: user.created_at,
        isOwner: user.app_metadata?.role === "owner",
        disabled: access?.disabled ?? true,
        mustChangePassword: access?.must_change_password ?? true,
      }
    })
    return NextResponse.json({ users: result })
  } catch {
    return badRequest("User administration is not configured.", 503)
  }
}

export async function POST(request: Request) {
  const context = await requireOwnerAdmin()
  if (!context.ok) return context.response
  const rate = rateLimit(context.user.id)
  if (!rate.allowed) return badRequest("Too many admin requests. Try again shortly.", 429)

  const body = await readBody(request)
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : ""
  const password = typeof body?.password === "string" ? body.password : ""
  if (!EMAIL_PATTERN.test(email) || email.length > 320) return badRequest("Enter a valid email address.")
  if (password.length < 12 || password.length > 128) return badRequest("Use a temporary password between 12 and 128 characters.")

  try {
    const admin = createAdminClient()
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { role: "user" },
    })
    if (error || !data.user) {
      return badRequest("The account could not be created. Check the email and try again.", 400)
    }

    const { error: accessError } = await admin.from("user_access").insert({
      user_id: data.user.id,
      disabled: false,
      must_change_password: true,
      created_by: context.user.id,
    })
    if (accessError) {
      await admin.auth.admin.deleteUser(data.user.id).catch(() => undefined)
      return badRequest("The account could not be initialized. No account was retained.", 503)
    }

    // Never return or log the temporary password.
    return NextResponse.json({ success: true }, { status: 201 })
  } catch {
    return badRequest("User administration is not configured.", 503)
  }
}

export async function PATCH(request: Request) {
  const context = await requireOwnerAdmin()
  if (!context.ok) return context.response
  const rate = rateLimit(context.user.id)
  if (!rate.allowed) return badRequest("Too many admin requests. Try again shortly.", 429)

  const body = await readBody(request)
  const userId = typeof body?.userId === "string" ? body.userId : ""
  const action = body?.action
  if (!UUID_PATTERN.test(userId)) return badRequest("A valid user ID is required.")
  if (!["disable", "restore", "temporary_password"].includes(String(action))) return badRequest("Unsupported user action.")

  try {
    const admin = createAdminClient()
    const { data: targetData, error: targetError } = await admin.auth.admin.getUserById(userId)
    const target = targetData.user
    if (targetError || !target) return badRequest("User not found.", 404)
    if (target.app_metadata?.role === "owner") return badRequest("Owner accounts cannot be changed through user management.", 403)

    if (action === "disable") {
      const { data: changed, error } = await admin.from("user_access").update({ disabled: true }).eq("user_id", userId).select("user_id").maybeSingle()
      if (error || !changed) return badRequest("Could not revoke this user's access.", 503)
      // Database access state is authoritative. Auth banning is defense in depth.
      await admin.auth.admin.updateUserById(userId, { ban_duration: "876000h" }).catch(() => undefined)
      return NextResponse.json({ success: true })
    }

    if (action === "restore") {
      const { error: unbanError } = await admin.auth.admin.updateUserById(userId, { ban_duration: "none" })
      if (unbanError) return badRequest("Could not restore the authentication account. Access remains disabled.", 503)
      const { data: changed, error } = await admin.from("user_access").update({ disabled: false }).eq("user_id", userId).select("user_id").maybeSingle()
      if (error || !changed) {
        await admin.from("user_access").update({ disabled: true }).eq("user_id", userId)
        await admin.auth.admin.updateUserById(userId, { ban_duration: "876000h" }).catch(() => undefined)
        return badRequest("Could not restore this user's access. Access remains disabled.", 503)
      }
      return NextResponse.json({ success: true })
    }

    const password = typeof body?.password === "string" ? body.password : ""
    if (password.length < 12 || password.length > 128) return badRequest("Use a temporary password between 12 and 128 characters.")
    const { data: priorAccess, error: priorError } = await admin.from("user_access").select("must_change_password").eq("user_id", userId).maybeSingle()
    if (priorError || !priorAccess) return badRequest("User access state is missing. The account remains restricted.", 503)
    const { data: gateUpdated, error: gateError } = await admin.from("user_access").update({ must_change_password: true }).eq("user_id", userId).select("user_id").maybeSingle()
    if (gateError || !gateUpdated) return badRequest("Could not prepare the account for a password reset.", 503)

    const { error: passwordError } = await admin.auth.admin.updateUserById(userId, { password })
    if (passwordError) {
      await admin.from("user_access").update({ must_change_password: priorAccess?.must_change_password ?? false }).eq("user_id", userId)
      return badRequest("The temporary password could not be set.", 503)
    }
    return NextResponse.json({ success: true })
  } catch {
    return badRequest("User administration is not configured.", 503)
  }
}

export async function DELETE(request: Request) {
  const context = await requireOwnerAdmin()
  if (!context.ok) return context.response
  const rate = rateLimit(context.user.id)
  if (!rate.allowed) return badRequest("Too many admin requests. Try again shortly.", 429)

  const body = await readBody(request)
  const userId = typeof body?.userId === "string" ? body.userId : ""
  if (!UUID_PATTERN.test(userId)) return badRequest("A valid user ID is required.")

  try {
    const admin = createAdminClient()
    const { data, error: lookupError } = await admin.auth.admin.getUserById(userId)
    if (lookupError || !data.user) return badRequest("User not found.", 404)
    if (data.user.app_metadata?.role === "owner") return badRequest("Owner accounts cannot be deleted through user management.", 403)

    const { error } = await admin.auth.admin.deleteUser(userId)
    if (error) return badRequest("Could not delete this user.", 503)
    return NextResponse.json({ success: true })
  } catch {
    return badRequest("User administration is not configured.", 503)
  }
}
