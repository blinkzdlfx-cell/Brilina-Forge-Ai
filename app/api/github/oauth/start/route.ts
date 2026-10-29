import { NextResponse } from "next/server"

import { getUserContext } from "@/lib/auth/require-user"
import { oauthConfig } from "@/lib/github/route-helpers"
import { getRuntimeEnv } from "@/lib/runtime-env"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const origin = new URL(request.url).origin
  const auth = await getUserContext()
  if (!auth.ok) return NextResponse.redirect(`${origin}/login`)

  const config = oauthConfig(getRuntimeEnv)
  if (!config) return NextResponse.redirect(`${origin}/?plugins=github&github_error=oauth_not_configured`)

  const state = crypto.randomUUID()
  const scope = getRuntimeEnv("GITHUB_AGENT_ALLOW_WORKFLOW_EDITS") === "true" ? "repo workflow" : "repo"
  const authorize = new URL("https://github.com/login/oauth/authorize")
  authorize.searchParams.set("client_id", config.clientId)
  authorize.searchParams.set("redirect_uri", `${origin}/api/github/oauth/callback`)
  authorize.searchParams.set("scope", scope)
  authorize.searchParams.set("state", state)
  authorize.searchParams.set("allow_signup", "false")

  const response = NextResponse.redirect(authorize.toString())
  // Bind the state to this browser and this user; the callback must match both.
  response.cookies.set("forge_gh_oauth", `${state}.${auth.user.id}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/github/oauth",
    maxAge: 600,
  })
  return response
}
