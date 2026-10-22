import "server-only"

import { createClient as createSupabaseClient } from "@supabase/supabase-js"

import { getRuntimeEnv } from "@/lib/runtime-env"

export function createAdminClient() {
  const url = getRuntimeEnv("NEXT_PUBLIC_SUPABASE_URL")
  const serviceRoleKey = getRuntimeEnv("SUPABASE_SERVICE_ROLE_KEY")
  if (!url || !serviceRoleKey) {
    throw new Error("Server-side Supabase admin configuration is missing.")
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })
}
