import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { join } from "node:path"

const root = fileURLToPath(new URL("..", import.meta.url))
const read = (path) => readFile(join(root, path), "utf8")

test("core Supabase schema enables RLS and defines ownership guards", async () => {
  const sql = await read("supabase/migrations/0001_initial_schema.sql")
  for (const table of ["conversations", "messages", "files", "user_access"]) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"))
  }
  assert.match(sql, /messages_reply_same_conversation/)
  assert.match(sql, /files_owner_consistency/)
  assert.match(sql, /user_access_select_own/)
  assert.doesNotMatch(sql, /create policy[^;]+on public\.user_access[^;]+for update/i)
})

test("chat and transcription APIs require a verified user context", async () => {
  const chat = await read("app/api/chat/route.ts")
  const transcribe = await read("app/api/transcribe/route.ts")
  assert.match(chat, /await requireUser\(\)/)
  assert.match(transcribe, /await requireUser\(\)/)
  assert.match(transcribe, /x-recording-session/i)
})

test("admin APIs enforce owner MFA and do not accept client-supplied identity", async () => {
  const guards = await read("lib/auth/require-user.ts")
  const adminRoute = await read("app/api/admin/users/route.ts")
  assert.match(guards, /getAuthenticatorAssuranceLevel/)
  assert.match(guards, /currentLevel !== "aal2"/)
  assert.match(adminRoute, /requireOwnerAdmin/)
  assert.match(adminRoute, /context\.user\.id/)
  assert.doesNotMatch(adminRoute, /body\.ownerId/)
})

test("voice sessions use server timestamps and enforce the 10-minute limit", async () => {
  const sessionRoute = await read("app/api/transcribe/session/route.ts")
  const migration = await read("supabase/migrations/0002_voice_recording_sessions.sql")
  const prompt = await read("components/prompt-form.tsx")
  assert.match(sessionRoute, /10 \* 60 \* 1000/)
  assert.match(sessionRoute, /started_at/)
  assert.match(sessionRoute, /stopped_at/)
  assert.match(migration, /attempt_count integer not null default 0/)
  assert.match(prompt, /10 \* 60 \* 1000/)
  assert.match(prompt, /finalizeRecording\("insert"\)/)
  assert.match(prompt, /Maximum recording length is 10 minutes\. Your recording has been transcribed\./)
  assert.match(prompt, /maxLengthReachedRef/)
  assert.doesNotMatch(prompt, /Recording time remaining|Countdown/i)
})
