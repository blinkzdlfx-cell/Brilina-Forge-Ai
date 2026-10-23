import { NextResponse } from "next/server"

import { checkRateLimit } from "@/lib/auth/rate-limit"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: Request) {
  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"
  const rate = checkRateLimit(`signin:${ip}`, 8, 15 * 60 * 1000)
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many sign-in attempts. Try again later." }, {
      status: 429,
      headers: { "retry-after": String(rate.retryAfterSeconds) },
    })
  }

  let body: { email?: unknown; password?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid sign-in request." }, { status: 400 })
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
  const password = typeof body.password === "string" ? body.password : ""
  if (!email || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || password.length > 1024) {
    return NextResponse.json({ error: "Enter a valid email and password." }, { status: 400 })
  }

  let supabase
  try {
    supabase = await createClient()
  } catch {
    return NextResponse.json({ error: "Authentication is not configured yet." }, { status: 503 })
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error || !data.user) {
    return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 })
  }

  const { data: access, error: accessError } = await supabase
    .from("user_access")
    .select("disabled, must_change_password")
    .eq("user_id", data.user.id)
    .maybeSingle()

  if (accessError || !access || access.disabled) {
    await supabase.auth.signOut().catch(() => undefined)
    return NextResponse.json({ error: "This account cannot access Brilina Forge AI." }, { status: 403 })
  }

  const redirectTo = access.must_change_password
    ? "/change-password"
    : data.user.app_metadata?.role === "owner"
      ? "/admin"
      : "/"

  return NextResponse.json({ success: true, redirectTo })
}
