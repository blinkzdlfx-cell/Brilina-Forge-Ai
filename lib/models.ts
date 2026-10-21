import { createOpenAI } from "@ai-sdk/openai"

import { getRuntimeEnv } from "@/lib/runtime-env"

export const CLOUDFLARE_MODEL_ID = "cloudflare-glm-4.7-flash"
export const CLOUDFLARE_MODEL_NAME = "@cf/zai-org/glm-4.7-flash"
export const CLOUDFLARE_VISION_MODEL_ID = "cloudflare-qwen3.8-27b"
export const CLOUDFLARE_VISION_MODEL_NAME = "@cf/qwen/qwen3.8-27b"
export const GROQ_VISION_MODEL_ID = "groq-qwen3.8-27b"
export const GROQ_VISION_MODEL_NAME = "qwen/qwen3.8-27b"
export const GROQ_SECONDARY_VISION_MODEL_ID = "groq-muse-spark-open"
export const GROQ_SECONDARY_VISION_MODEL_NAME = "meta-models/muse-spark-open"

export const DEFAULT_MODEL = CLOUDFLARE_MODEL_ID

export type ModelCapability = "text" | "vision"

export interface GatewayModel {
  id: string
  name: string
  capabilities?: ModelCapability[]
  maxImages?: number
}

type ModelDefinition = GatewayModel & {
  provider: "cloudflare" | "groq"
  providerModel: string
}

const MODEL_DEFINITIONS: ModelDefinition[] = [
  {
    id: CLOUDFLARE_MODEL_ID,
    name: "GLM 4.7 Flash (Cloudflare)",
    capabilities: ["text"],
    maxImages: 0,
    provider: "cloudflare",
    providerModel: CLOUDFLARE_MODEL_NAME,
  },
  {
    id: CLOUDFLARE_VISION_MODEL_ID,
    name: "Qwen 3.8 27B Vision (Cloudflare)",
    capabilities: ["text", "vision"],
    maxImages: 1,
    provider: "cloudflare",
    providerModel: CLOUDFLARE_VISION_MODEL_NAME,
  },
  {
    id: GROQ_VISION_MODEL_ID,
    name: "Qwen 3.8 27B Vision (Groq)",
    capabilities: ["text", "vision"],
    maxImages: 3,
    provider: "groq",
    providerModel: GROQ_VISION_MODEL_NAME,
  },
  {
    id: GROQ_SECONDARY_VISION_MODEL_ID,
    name: "Muse Spark Vision (Groq preview)",
    capabilities: ["text", "vision"],
    maxImages: 3,
    provider: "groq",
    providerModel: GROQ_SECONDARY_VISION_MODEL_NAME,
  },
]

export const MODELS: GatewayModel[] = MODEL_DEFINITIONS.map(
  ({ id, name, capabilities, maxImages }) => ({
    id,
    name,
    capabilities,
    maxImages,
  })
)

export function getAvailableModels(): GatewayModel[] {
  const cloudflareConfigured = Boolean(
    getRuntimeEnv("CLOUDFLARE_ACCOUNT_ID") &&
      getRuntimeEnv("CLOUDFLARE_AI_API_TOKEN")
  )
  const groqConfigured = Boolean(getRuntimeEnv("GROQ_API_KEY"))
  const secondaryGroqEnabled =
    getRuntimeEnv("GROQ_VISION_SECONDARY_MODEL") === GROQ_SECONDARY_VISION_MODEL_NAME

  return MODELS.filter((model) => {
    if (model.id === DEFAULT_MODEL) return true
    if (model.id === CLOUDFLARE_VISION_MODEL_ID) return cloudflareConfigured
    if (model.id === GROQ_VISION_MODEL_ID) return groqConfigured
    if (model.id === GROQ_SECONDARY_VISION_MODEL_ID) {
      return groqConfigured && secondaryGroqEnabled
    }
    return false
  })
}

export function isModelAllowed(id: string) {
  return getAvailableModels().some((model) => model.id === id)
}

export function isVisionModel(id: string) {
  return Boolean(
    MODEL_DEFINITIONS.find((model) => model.id === id)?.capabilities?.includes("vision")
  )
}

export function getModelImageLimit(id: string) {
  return MODEL_DEFINITIONS.find((model) => model.id === id)?.maxImages ?? 0
}

export function getLanguageModel(id: string) {
  const definition = MODEL_DEFINITIONS.find((model) => model.id === id)
  if (!definition || !isModelAllowed(id)) {
    throw new Error("The requested model is not available.")
  }

  if (definition.provider === "cloudflare") {
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

    return cloudflare.chat(definition.providerModel)
  }

  const apiKey = getRuntimeEnv("GROQ_API_KEY")
  if (!apiKey) throw new Error("Groq vision is not configured.")

  const groq = createOpenAI({
    name: "groq",
    baseURL: "https://api.groq.com/openai/v1",
    apiKey,
  })

  return groq.chat(definition.providerModel)
}
