import { NextResponse } from "next/server"

import { requireUser } from "@/lib/auth/require-user"
import { createAdminClient } from "@/lib/supabase/admin"

export async function POST(request: Request) {
  const context = await requireUser({ allowMustChange: true })
  if (!context.ok) return context.response

  let password: unknown
  try {
    const body = await request.json() as { password?: unknown }
    password = body.password
  } catch {
    return NextResponse.json({ error: "Invalid password-change request." }, { status: 400 })
  }

  if (typeof password !== "string" || password.length < 12 || password.length > 128) {
    return NextResponse.json({ error: "Use a password between 12 and 128 characters." }, { status: 400 })
  }

  const { error: passwordError } = await context.supabase.auth.updateUser({ password })
  if (passwordError) {
    return NextResponse.json({ error: "Password could not be changed. Try again." }, { status: 400 })
  }

  try {
    const admin = createAdminClient()
    const { error } = await admin
      .from("user_access")
      .update({ must_change_password: false })
      .eq("user_id", context.user.id)
    if (error) {
      return NextResponse.json({ error: "Password changed, but account setup is incomplete. Sign in again or contact the owner." }, { status: 503 })
    }
  } catch {
    return NextResponse.json({ error: "Password changed, but account setup is incomplete. Contact the owner." }, { status: 503 })
  }

  return NextResponse.json({ success: true })
}
