import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const migration = await readFile(
  new URL("../supabase/migrations/0006_message_client_ids.sql", import.meta.url),
  "utf8"
)

test("message persistence has an idempotent client identifier scoped to a conversation", () => {
  assert.match(migration, /add column if not exists client_message_id text/i)
  assert.match(migration, /unique index if not exists messages_conversation_client_id_idx/i)
  assert.match(migration, /\(conversation_id, client_message_id\)/i)
})
