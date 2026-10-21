import assert from "node:assert/strict"
import test from "node:test"

import { readJsonWithinLimit } from "../lib/bounded-request.mjs"

function requestFromChunks(chunks, onCancel = () => {}) {
  const encoder = new TextEncoder()
  return {
    body: new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
        controller.close()
      },
      cancel(reason) {
        onCancel(reason)
      },
    }),
  }
}

test("parses valid JSON across stream chunk boundaries", async () => {
  const result = await readJsonWithinLimit(requestFromChunks(['{"mes', 'sages":[]}']), 100)
  assert.equal(result.ok, true)
  if (result.ok) assert.deepEqual(result.value, { messages: [] })
})

test("rejects oversized bodies even when Content-Length is unavailable", async () => {
  const result = await readJsonWithinLimit(requestFromChunks(["x".repeat(80)]), 32)
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.reason, "too_large")
})

test("rejects malformed JSON and invalid UTF-8 safely", async () => {
  const malformed = await readJsonWithinLimit(requestFromChunks(["{nope"]), 32)
  assert.deepEqual(malformed, { ok: false, reason: "invalid_json", bytesRead: 5 })

  const invalidUtf8 = {
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([0xc3, 0x28]))
        controller.close()
      },
    }),
  }
  const invalid = await readJsonWithinLimit(invalidUtf8, 32)
  assert.equal(invalid.ok, false)
  if (!invalid.ok) assert.equal(invalid.reason, "invalid_json")
})
