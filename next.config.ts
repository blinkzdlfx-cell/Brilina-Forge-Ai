import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import type { NextConfig } from "next"

// Next.js inlines NEXT_PUBLIC_* values into browser bundles at build time.
// Cloudflare Worker vars are runtime bindings, so also read the public values
// from wrangler.jsonc when the build environment does not provide them.
function getWranglerPublicEnv() {
  try {
    const configPath = resolve(process.cwd(), "wrangler.jsonc")
    const config = JSON.parse(readFileSync(configPath, "utf8")) as {
      vars?: Record<string, unknown>
    }
    return config.vars ?? {}
  } catch {
    return {}
  }
}

const wranglerVars = getWranglerPublicEnv()

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_SUPABASE_URL:
      process.env.NEXT_PUBLIC_SUPABASE_URL ??
      (typeof wranglerVars.NEXT_PUBLIC_SUPABASE_URL === "string"
        ? wranglerVars.NEXT_PUBLIC_SUPABASE_URL
        : ""),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      (typeof wranglerVars.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY === "string"
        ? wranglerVars.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
        : ""),
  },
  turbopack: {
    resolveAlias: {
      clsx: "cn",
      "tailwind-merge": "cn",
    },
  },
}

export default nextConfig
