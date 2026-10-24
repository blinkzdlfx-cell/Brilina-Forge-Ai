import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const migration = await readFile(
  new URL("../supabase/migrations/0005_conversation_controls_private_storage.sql", import.meta.url),
  "utf8"
)

test("conversation controls preserve title and add pin/archive state", () => {
  assert.match(migration, /add column if not exists is_pinned boolean not null default false/i)
  assert.match(migration, /add column if not exists archived_at timestamptz/i)
  assert.match(migration, /conversations_active_user_idx/i)
  assert.match(migration, /conversations_archived_user_idx/i)
  assert.match(migration, /durable[\\s\\S]*user-visible name/i)
})

test("private file bucket is private, bounded, and limited to supported file types", () => {
  assert.match(migration, /'forge-private-files',[\s\S]*?false,[\s\S]*?10485760/i)
  assert.match(migration, /application\/pdf/i)
  assert.match(migration, /openxmlformats-officedocument\.wordprocessingml\.document/i)
  assert.match(migration, /set public = false/i)
})

test("storage object policies scope all operations to the authenticated user's folder", () => {
  for (const operation of ["select", "insert", "update", "delete"]) {
    assert.ok(migration.includes("forge_private_files_" + operation + "_own"))
  }
  assert.equal((migration.match(/\(select auth\.uid\(\)\)::text/g) ?? []).length, 5)
})
