import { getRuntimeEnv } from "@/lib/runtime-env"

export const dynamic = "force-dynamic"

export async function GET() {
  return Response.json({
    status: "ok",
    provider: "cloudflare-workers-ai",
    model: "@cf/zai-org/glm-4.7-flash",
    webSearchConfigured: Boolean(getRuntimeEnv("TAVILY_API_KEY")),
    aiConfigured: Boolean(
      getRuntimeEnv("CLOUDFLARE_ACCOUNT_ID") &&
        getRuntimeEnv("CLOUDFLARE_AI_API_TOKEN")
    ),
  })
}
