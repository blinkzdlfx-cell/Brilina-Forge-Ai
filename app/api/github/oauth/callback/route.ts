import { NextResponse } from "next/server"

import { getUserContext } from "@/lib/auth/require-user"
import { verifyToken } from "@/lib/github/connect"
import { oauthConfig } from "@/lib/github/route-helpers"
import { saveConnection } from "@/lib/github/store"
import { getRuntimeEnv } from "@/lib/runtime-env"

export const dynamic = "force-dynamic"

function done(origin: string, error?: string) {
  const target = new URL(`${origin}/`)
  target.searchParams.set("plugins", "github")
  if (error) target.searchParams.set("github_error", error)
  const response = NextResponse.redirect(target.toString())
  response.cookies.set("forge_gh_oauth", "", { path: "/api/github/oauth", maxAge: 0 })
  return response
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const origin = url.origin
  const auth = await getUserContext()
  if (!auth.ok) return NextResponse.redirect(`${origin}/login`)

  const config = oauthConfig(getRuntimeEnv)
  if (!config) return done(origin, "oauth_not_configured")
  if (url.searchParams.get("error")) return done(origin, "access_denied")

  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const cookie = request.headers.get("cookie")?.split(/;\s*/).find((part) => part.startsWith("forge_gh_oauth="))?.slice("forge_gh_oauth=".length)
  if (!code || !state || !cookie || cookie !== `${state}.${auth.user.id}`) return done(origin, "invalid_state")

  try {
    const exchange = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json", "user-agent": "brilina-forge-ai" },
      body: JSON.stringify({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: `${origin}/api/github/oauth/callback`,
      }),
      signal: AbortSignal.timeout(15_000),
    })
    const payload = (await exchange.json()) as { access_token?: string; error?: string }
    if (!exchange.ok || !payload.access_token) return done(origin, "token_exchange_failed")

    const verified = await verifyToken(payload.access_token)
    await saveConnection({
      userId: auth.user.id,
      token: payload.access_token,
      login: verified.login,
      githubUserId: verified.githubUserId,
      authKind: "oauth",
      scopes: verified.scopes,
    })
    return done(origin)
  } catch {
    return done(origin, "connection_failed")
  }
}
