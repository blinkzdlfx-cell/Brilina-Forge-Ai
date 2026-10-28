export const DEFAULT_PERSONALIZATION = {
  theme: "system",
  responseStyle: "default",
  responseLength: "balanced",
  tone: "neutral",
  formatting: "balanced",
  emojiUsage: "never",
  aboutUser: "",
  responseInstructions: "",
  planning: "before-significant-changes",
  batchSize: "small",
  runTests: "relevant",
  explainChanges: true,
  approvalBeforeMerge: true,
  showProgress: true,
} as const

export type PersonalizationPreferences = {
  theme: "system" | "light" | "dark"
  responseStyle: "default" | "professional" | "friendly" | "direct" | "creative"
  responseLength: "concise" | "balanced" | "detailed"
  tone: "neutral" | "friendly" | "enthusiastic"
  formatting: "minimal" | "balanced" | "structured"
  emojiUsage: "never" | "occasionally" | "frequently"
  aboutUser: string
  responseInstructions: string
  planning: "always" | "before-significant-changes" | "when-asked"
  batchSize: "tiny" | "small" | "medium"
  runTests: "always" | "relevant" | "when-asked"
  explainChanges: boolean
  approvalBeforeMerge: boolean
  showProgress: boolean
}

const choices = {
  theme: ["system", "light", "dark"],
  responseStyle: ["default", "professional", "friendly", "direct", "creative"],
  responseLength: ["concise", "balanced", "detailed"],
  tone: ["neutral", "friendly", "enthusiastic"],
  formatting: ["minimal", "balanced", "structured"],
  emojiUsage: ["never", "occasionally", "frequently"],
  planning: ["always", "before-significant-changes", "when-asked"],
  batchSize: ["tiny", "small", "medium"],
  runTests: ["always", "relevant", "when-asked"],
} as const

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && allowed.includes(value as T) ? value as T : fallback
}

function boundedText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : ""
}

export function normalizePersonalization(value: unknown): PersonalizationPreferences {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {}
  return {
    theme: pick(input.theme, choices.theme, DEFAULT_PERSONALIZATION.theme),
    responseStyle: pick(input.responseStyle, choices.responseStyle, DEFAULT_PERSONALIZATION.responseStyle),
    responseLength: pick(input.responseLength, choices.responseLength, DEFAULT_PERSONALIZATION.responseLength),
    tone: pick(input.tone, choices.tone, DEFAULT_PERSONALIZATION.tone),
    formatting: pick(input.formatting, choices.formatting, DEFAULT_PERSONALIZATION.formatting),
    emojiUsage: pick(input.emojiUsage, choices.emojiUsage, DEFAULT_PERSONALIZATION.emojiUsage),
    aboutUser: boundedText(input.aboutUser, 2000),
    responseInstructions: boundedText(input.responseInstructions, 3000),
    planning: pick(input.planning, choices.planning, DEFAULT_PERSONALIZATION.planning),
    batchSize: pick(input.batchSize, choices.batchSize, DEFAULT_PERSONALIZATION.batchSize),
    runTests: pick(input.runTests, choices.runTests, DEFAULT_PERSONALIZATION.runTests),
    explainChanges: typeof input.explainChanges === "boolean" ? input.explainChanges : DEFAULT_PERSONALIZATION.explainChanges,
    approvalBeforeMerge: typeof input.approvalBeforeMerge === "boolean" ? input.approvalBeforeMerge : DEFAULT_PERSONALIZATION.approvalBeforeMerge,
    showProgress: typeof input.showProgress === "boolean" ? input.showProgress : DEFAULT_PERSONALIZATION.showProgress,
  }
}

export function buildPersonalizationInstructions(value: unknown) {
  const p = normalizePersonalization(value)
  const lines = [
    "User personalization preferences (follow when relevant):",
    `Response style: ${p.responseStyle}.`,
    `Response length: ${p.responseLength}.`,
    `Tone: ${p.tone}.`,
    `Formatting: ${p.formatting}.`,
    `Emoji usage: ${p.emojiUsage}.`,
    `Planning preference: ${p.planning}.`,
    `Implementation batch size: ${p.batchSize}.`,
    `Testing preference: ${p.runTests}.`,
    `Explain important changes: ${p.explainChanges ? "yes" : "only when needed"}.`,
    `Require explicit user approval before a GitHub merge: ${p.approvalBeforeMerge ? "yes" : "no"}.`,
    `Show progress and blockers during long tasks: ${p.showProgress ? "yes" : "no"}.`,
  ]
  if (p.aboutUser) lines.push("Relevant user context: " + p.aboutUser)
  if (p.responseInstructions) lines.push("Additional response instructions: " + p.responseInstructions)
  return lines.join("\n")
}
