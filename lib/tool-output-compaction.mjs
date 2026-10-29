/**
 * Shrink large string values inside tool outputs of earlier turns before they
 * are sent to the model again. A coding agent reads many files; replaying every
 * file body on every later request would burn the free-tier token budget. The
 * shape of each output is preserved so UI-message validation still passes, and
 * the stored conversation is never modified.
 *
 * @param {unknown[]} messages UI messages in chronological order
 * @param {{ maxChars?: number }} [options]
 */
export function compactOldToolOutputs(messages, options = {}) {
  const maxChars = options.maxChars ?? 1200
  let lastUserIndex = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = /** @type {{ role?: unknown }} */ (messages[i])
    if (message && message.role === "user") {
      lastUserIndex = i
      break
    }
  }

  return messages.map((raw, index) => {
    if (index >= lastUserIndex) return raw
    const message = /** @type {{ role?: unknown, parts?: unknown }} */ (raw)
    if (!message || message.role !== "assistant" || !Array.isArray(message.parts)) return raw
    let changed = false
    const parts = message.parts.map((rawPart) => {
      const part = /** @type {Record<string, unknown>} */ (rawPart)
      if (!part || typeof part.type !== "string" || !part.type.startsWith("tool-")) return rawPart
      if (part.state !== "output-available" || part.output === undefined) return rawPart
      const output = clipStrings(part.output, maxChars)
      if (output === part.output) return rawPart
      changed = true
      return { ...part, output }
    })
    return changed ? { ...message, parts } : raw
  })
}

/**
 * @param {unknown} value
 * @param {number} maxChars
 * @returns {unknown}
 */
function clipStrings(value, maxChars) {
  if (typeof value === "string") {
    return value.length <= maxChars
      ? value
      : `${value.slice(0, maxChars)}\n…[earlier tool output shortened to save context; call the tool again if needed]`
  }
  if (Array.isArray(value)) {
    let changed = false
    const next = value.map((item) => {
      const clipped = clipStrings(item, maxChars)
      if (clipped !== item) changed = true
      return clipped
    })
    return changed ? next : value
  }
  if (value && typeof value === "object") {
    let changed = false
    /** @type {Record<string, unknown>} */
    const next = {}
    for (const [key, item] of Object.entries(value)) {
      const clipped = clipStrings(item, maxChars)
      if (clipped !== item) changed = true
      next[key] = clipped
    }
    return changed ? next : value
  }
  return value
}
