import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8")

test("conversation routes enforce authenticated user ownership and support lifecycle controls", async () => {
  const list = await read("app/api/conversations/route.ts")
  const detail = await read("app/api/conversations/[conversationId]/route.ts")
  assert.match(list, /requireUser/)
  assert.match(list, /archived_at/)
  assert.match(list, /is_pinned/)
  assert.match(detail, /\.eq\("user_id", auth\.user\.id\)/)
  assert.match(detail, /export async function PATCH/)
  assert.match(detail, /export async function DELETE/)
  assert.match(detail, /archived_at/)
})

test("message persistence is bounded, idempotent, and refuses inline base64 attachments", async () => {
  const route = await read("app/api/conversations/[conversationId]/messages/route.ts")
  assert.match(route, /MAX_MESSAGES_PER_SAVE/)
  assert.match(route, /client_message_id/)
  assert.match(route, /containsInlineDataUrl/)
  assert.match(route, /upload_attachments_before_saving/)
  assert.match(route, /attempt < 3/)
  assert.match(route, /message_save_conflict_retry/)
  assert.match(route, /existing\.status !== message\.status/)
  assert.match(route, /message_update_failed/)
  assert.match(route, /requireUser/)
  assert.match(route, /\.eq\("user_id", auth\.user\.id\)/)
})
