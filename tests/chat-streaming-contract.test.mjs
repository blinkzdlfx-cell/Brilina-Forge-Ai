import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const route = await readFile(new URL("../app/api/chat/route.ts", import.meta.url), "utf8")
const chat = await readFile(new URL("../components/chat.tsx", import.meta.url), "utf8")

test("chat route uses the AI SDK native streaming response path", () => {
  assert.match(route, /streamText\(/)
  assert.match(route, /toUIMessageStream\(/)
  assert.match(route, /createUIMessageStreamResponse\(/)
  assert.match(route, /stream:\s*result\.stream/)
  assert.match(chat, /useChat<ChatUIMessage>/)
})

test("streaming forwards cancellation to the model request", () => {
  assert.match(route, /abortSignal:\s*req\.signal/)
  assert.match(chat, /\bstop\(\)/)
})

test("stream lifecycle diagnostics do not log generated text", () => {
  assert.match(route, /"first_text_chunk"/)
  assert.match(route, /"generation_finished"/)
  assert.match(route, /"generation_aborted"/)
  assert.match(route, /totalUsage\.inputTokens/)
  assert.match(route, /totalUsage\.outputTokens/)
  assert.doesNotMatch(route, /logChatDiagnostic\([^\n]*chunk\.text/)
  assert.match(route, /elapsedTimeKind: "wall_clock"/)
  assert.match(route, /errorCategory: classifyError\(error\)/)
  assert.doesNotMatch(route, /errorMessage: error\.message/)
})

test("the route retains bounded tool turns and output tokens", () => {
  assert.match(route, /const MAX_OUTPUT_TOKENS = 4096/)
  assert.match(route, /const MAX_TOOL_STEPS = 4/)
  assert.match(route, /stopWhen:\s*isStepCount\(MAX_TOOL_STEPS\)/)
})
