/**
 * Select the most recent messages and reject contexts that exceed explicit
 * structural or text budgets. No message is silently truncated or reordered.
 *
 * @param {unknown} messages
 * @param {{ maxMessages?: number, maxPartsPerMessage?: number, maxTextCharsPerMessage?: number, maxTotalTextChars?: number }} [limits]
 * @returns {{ ok: true, messages: any[], textChars: number } | { ok: false, reason: "invalid_structure" | "message_text_too_large" | "context_text_too_large", textChars: number }}
 */
export function prepareBoundedContext(messages, limits = {}) {
  const maxMessages = limits.maxMessages ?? 6
  const maxPartsPerMessage = limits.maxPartsPerMessage ?? 24
  const maxTextCharsPerMessage = limits.maxTextCharsPerMessage ?? 12_000
  const maxTotalTextChars = limits.maxTotalTextChars ?? 32_000

  if (!Array.isArray(messages) || messages.length === 0) {
    return { ok: false, reason: "invalid_structure", textChars: 0 }
  }

  const recentMessages = messages.slice(-maxMessages)
  let totalTextChars = 0

  for (const rawMessage of recentMessages) {
    if (!rawMessage || typeof rawMessage !== "object") {
      return { ok: false, reason: "invalid_structure", textChars: totalTextChars }
    }

    const message = /** @type {Record<string, unknown>} */ (rawMessage)
    if (!Array.isArray(message.parts) || message.parts.length > maxPartsPerMessage) {
      return { ok: false, reason: "invalid_structure", textChars: totalTextChars }
    }

    let messageTextChars = 0
    for (const rawPart of message.parts) {
      if (!rawPart || typeof rawPart !== "object") continue
      const part = /** @type {Record<string, unknown>} */ (rawPart)
      if (part.type !== "text") continue
      if (typeof part.text !== "string") {
        return { ok: false, reason: "invalid_structure", textChars: totalTextChars }
      }

      messageTextChars += part.text.length
      totalTextChars += part.text.length
      if (messageTextChars > maxTextCharsPerMessage) {
        return { ok: false, reason: "message_text_too_large", textChars: totalTextChars }
      }
      if (totalTextChars > maxTotalTextChars) {
        return { ok: false, reason: "context_text_too_large", textChars: totalTextChars }
      }
    }
  }

  return { ok: true, messages: recentMessages, textChars: totalTextChars }
}
