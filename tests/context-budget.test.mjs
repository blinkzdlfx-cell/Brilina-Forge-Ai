import assert from "node:assert/strict"
import test from "node:test"

import { prepareBoundedContext } from "../lib/context-budget.mjs"

const message = (text) => ({ role: "user", parts: [{ type: "text", text }] })

test("keeps only the most recent messages in chronological order", () => {
  const input = [message("one"), message("two"), message("three"), message("four")]
  const result = prepareBoundedContext(input, { maxMessages: 2 })
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.deepEqual(result.messages, input.slice(-2))
    assert.equal(result.textChars, 9)
  }
})

test("rejects a single oversized message instead of silently truncating it", () => {
  const result = prepareBoundedContext([message("x".repeat(11))], {
    maxTextCharsPerMessage: 10,
  })
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.reason, "message_text_too_large")
})

test("rejects contexts that exceed the aggregate text budget", () => {
  const result = prepareBoundedContext([message("12345"), message("67890")], {
    maxTextCharsPerMessage: 10,
    maxTotalTextChars: 8,
  })
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.reason, "context_text_too_large")
})

test("rejects malformed message structures and excessive part counts", () => {
  assert.equal(prepareBoundedContext([null]).ok, false)
  assert.equal(
    prepareBoundedContext([{ parts: Array.from({ length: 3 }, () => ({ type: "text", text: "x" })) }], {
      maxPartsPerMessage: 2,
    }).ok,
    false,
  )
})

test("counts text parts without discarding non-text source parts", () => {
  const input = [{
    role: "user",
    parts: [
      { type: "text", text: "Explain this image" },
      { type: "file", mediaType: "image/png", url: "https://example.com/image.png" },
    ],
  }]
  const result = prepareBoundedContext(input)
  assert.equal(result.ok, true)
  if (result.ok) assert.equal(result.textChars, 18)
})
