import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const route = await readFile(new URL("../app/api/files/[fileId]/process/route.ts", import.meta.url), "utf8")

test("document processing is authenticated, owner-scoped, bounded, and supports TXT, Markdown, PDF, DOCX, and vision", () => {
  assert.match(route, /requireUser/)
  assert.match(route, /\.eq\("user_id", auth\.user\.id\)/)
  assert.match(route, /MAX_SOURCE_BYTES/)
  assert.match(route, /text\/markdown/)
  assert.match(route, /application\/pdf/)
  assert.match(route, /DOCX_TYPE/)
  assert.match(route, /GEMINI_API_KEY/)
  assert.match(route, /"x-goog-api-key": key/)
  assert.doesNotMatch(route, /generateContent\?key=/)
  assert.match(route, /analyzeImage/)
  assert.match(route, /AbortSignal\.timeout/)
  assert.match(route, /createAdminClient/)
})
