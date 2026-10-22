import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

import { getRuntimeEnv } from "@/lib/runtime-env"

function getSupabasePublicConfig() {
  const url = getRuntimeEnv("NEXT_PUBLIC_SUPABASE_URL")
  const key = getRuntimeEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
  if (!url || !key) {
    throw new Error("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.")
  }
  return { url, key }
}

export async function createClient() {
  const cookieStore = await cookies()
  const { url, key } = getSupabasePublicConfig()

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // Server Components cannot always write cookies. proxy.ts handles refresh.
        }
      },
    },
  })
}
