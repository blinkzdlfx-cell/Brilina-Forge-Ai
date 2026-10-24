import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

import { getRuntimeEnv } from "@/lib/runtime-env"

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code")
  const requestedNext = request.nextUrl.searchParams.get("next") ?? "/"
  let next = "/"

  if (requestedNext.startsWith("/")) {
    try {
      const target = new URL(requestedNext, request.url)
      if (target.origin === request.nextUrl.origin) {
        next = `${target.pathname}${target.search}${target.hash}`
      }
    } catch {
      next = "/"
    }
  }

  const supabaseUrl = getRuntimeEnv("NEXT_PUBLIC_SUPABASE_URL")
  const supabaseKey = getRuntimeEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")

  if (!code || !supabaseUrl || !supabaseKey) {
    return NextResponse.redirect(new URL("/login?error=auth_callback_failed", request.url))
  }

  // Keep the redirect response and Supabase auth cookies together. In the
  // Cloudflare Worker runtime, returning a separately-created redirect can
  // otherwise lose the recovery session cookies written during code exchange.
  let response = NextResponse.redirect(new URL(next, request.url))

  try {
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }

          response = NextResponse.redirect(new URL(next, request.url))
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
        },
      },
    })

    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      return NextResponse.redirect(new URL("/login?error=auth_callback_failed", request.url))
    }
  } catch {
    return NextResponse.redirect(new URL("/login?error=auth_callback_failed", request.url))
  }

  return response
}
