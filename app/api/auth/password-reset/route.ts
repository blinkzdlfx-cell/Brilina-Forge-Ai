import { NextResponse } from "next/server"

import { checkRateLimit } from "@/lib/auth/rate-limit"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: Request) {
  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"
  const rate = checkRateLimit(`password-reset:${ip}`, 5, 15 * 60 * 1000)
  if (!rate.allowed) {
    return NextResponse.json({ success: true }, { status: 200 })
  }

  let email = ""
  try {
    const body = await request.json() as { email?: unknown }
    email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
  } catch {
    return NextResponse.json({ success: true })
  }

  if (email && email.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    try {
      const supabase = await createClient()
      const redirectTo = new URL("/auth/callback?next=/reset-password", request.url).toString()
      await supabase.auth.resetPasswordForEmail(email, { redirectTo })
    } catch {
      // Keep the response generic so account existence and provider errors are not disclosed.
    }
  }

  return NextResponse.json({
    success: true,
    message: "If that email belongs to an enabled account, a password-reset link will be sent.",
  })
}
