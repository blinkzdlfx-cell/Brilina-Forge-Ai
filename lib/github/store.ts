import { createClient } from "@supabase/supabase-js"

import { getRuntimeEnv } from "../runtime-env"
import { decryptToken, encryptToken } from "./crypto"

// Service-role access is confined to this module. Callers must already have
// authenticated the user and pass that user's id.
export function githubAdmin() {
  const url = getRuntimeEnv("NEXT_PUBLIC_SUPABASE_URL")
  const key = getRuntimeEnv("SUPABASE_SERVICE_ROLE_KEY")
  if (!url || !key) throw new Error("Server-side Supabase configuration is missing.")
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  })
}

export type GithubRepoRow = { full_name: string; default_branch: string }

export async function saveConnection(input: {
  userId: string
  token: string
  login: string
  githubUserId: number | null
  authKind: "oauth" | "pat"
  scopes: string
}) {
  const ciphertext = await encryptToken(input.token)
  const { error } = await githubAdmin().from("github_connections").upsert({
    user_id: input.userId,
    github_login: input.login,
    github_user_id: input.githubUserId,
    auth_kind: input.authKind,
    token_ciphertext: ciphertext,
    scopes: input.scopes.slice(0, 500),
    updated_at: new Date().toISOString(),
  })
  if (error) throw new Error("Could not save the GitHub connection.")
}

export async function getConnectionSummary(userId: string) {
  const { data, error } = await githubAdmin()
    .from("github_connections")
    .select("github_login, auth_kind, scopes")
    .eq("user_id", userId)
    .maybeSingle()
  if (error) throw new Error("Could not read the GitHub connection.")
  return data as { github_login: string; auth_kind: "oauth" | "pat"; scopes: string } | null
}

export async function getGithubToken(userId: string) {
  const { data, error } = await githubAdmin()
    .from("github_connections")
    .select("token_ciphertext")
    .eq("user_id", userId)
    .maybeSingle()
  if (error || !data) return null
  try {
    return await decryptToken(data.token_ciphertext as string)
  } catch {
    return null
  }
}

export async function deleteConnection(userId: string) {
  const admin = githubAdmin()
  await admin.from("github_repo_access").delete().eq("user_id", userId)
  const { error } = await admin.from("github_connections").delete().eq("user_id", userId)
  if (error) throw new Error("Could not disconnect GitHub.")
}

export async function listAllowedRepos(userId: string): Promise<GithubRepoRow[]> {
  const { data, error } = await githubAdmin()
    .from("github_repo_access")
    .select("full_name, default_branch")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
  if (error) throw new Error("Could not read the repository list.")
  return (data ?? []) as GithubRepoRow[]
}

export async function addAllowedRepos(userId: string, repos: GithubRepoRow[]) {
  if (!repos.length) return
  const { error } = await githubAdmin()
    .from("github_repo_access")
    .upsert(
      repos.map((repo) => ({ user_id: userId, ...repo })),
      { onConflict: "user_id,full_name" }
    )
  if (error) throw new Error("Could not save repository access.")
}

export async function removeAllowedRepos(userId: string, names: string[]) {
  if (!names.length) return
  const { error } = await githubAdmin()
    .from("github_repo_access")
    .delete()
    .eq("user_id", userId)
    .in("full_name", names)
  if (error) throw new Error("Could not remove repository access.")
}

export async function hasGithubConnection(userId: string) {
  try {
    const { data } = await githubAdmin()
      .from("github_connections")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle()
    return Boolean(data)
  } catch {
    return false
  }
}

// Used by the chat route to decide whether the coding-agent tools are offered.
// Any failure means "no GitHub tools": normal chat must never depend on this.
export async function getAgentAccess(userId: string): Promise<GithubRepoRow[] | null> {
  try {
    const admin = githubAdmin()
    const { data: connection, error: connectionError } = await admin
      .from("github_connections")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle()
    if (connectionError || !connection) return null
    const repos = await listAllowedRepos(userId)
    return repos.length ? repos : null
  } catch {
    return null
  }
}
