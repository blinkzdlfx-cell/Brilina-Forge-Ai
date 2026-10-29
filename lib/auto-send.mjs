/**
 * Decide whether the chat should automatically send a follow-up request.
 *
 * The AI SDK helper `lastAssistantMessageIsCompleteWithToolCalls` is true for
 * ANY finished tool call at the end of a message. For a coding agent that is
 * dangerous: when a run stops because its step budget ran out right after a
 * server-side tool call, the browser would silently start another full run, and
 * repeat, spending free-tier quota. Only a user's answer to the client-side
 * `ask_user` tool should resume the conversation automatically.
 *
 * @param {Array<{ role?: string, parts?: Array<Record<string, unknown>> }>} messages
 */
export function shouldAutoSendAfterToolAnswer(messages) {
  const last = messages.at(-1)
  if (!last || last.role !== "assistant" || !Array.isArray(last.parts)) return false
  const toolParts = last.parts.filter((part) => typeof part.type === "string" && part.type.startsWith("tool-"))
  const finalTool = toolParts.at(-1)
  return Boolean(
    finalTool &&
      finalTool.type === "tool-ask_user" &&
      finalTool.state === "output-available"
  )
}
