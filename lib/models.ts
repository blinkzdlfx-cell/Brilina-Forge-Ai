import { createOpenAI } from "@ai-sdk/openai"

import { getRuntimeEnv } from "@/lib/runtime-env"

export const CLOUDFLARE_MODEL_ID = "cloudflare-glm-4.7-flash"
export const CLOUDFLARE_MODEL_NAME = "@cf/zai-org/glm-4.7-flash"

export const MODELS = [
  {
    id: CLOUDFLARE_MODEL_ID,
    name: "GLM 4.7 Flash (Cloudflare)",
  },
]

export const DEFAULT_MODEL = CLOUDFLARE_MODEL_ID

export interface GatewayModel {
  id: string
  name: string
}

export function isModelAllowed(id: string) {
  return MODELS.some((model) => model.id === id)
}

export function getLanguageModel(id: string) {
  if (!isModelAllowed(id)) {
    throw new Error("The requested model is not available.")
  }

  const accountId = getRuntimeEnv("CLOUDFLARE_ACCOUNT_ID")
  const apiKey = getRuntimeEnv("CLOUDFLARE_AI_API_TOKEN")

  if (!accountId || !apiKey) {
    throw new Error("Cloudflare Workers AI is not configured.")
  }

  const cloudflare = createOpenAI({
    name: "cloudflare-workers-ai",
    baseURL: `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1`,
    apiKey,
  })

  return cloudflare.chat(CLOUDFLARE_MODEL_NAME)
}
