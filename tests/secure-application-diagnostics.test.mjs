import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { join } from "node:path"

const root = fileURLToPath(new URL("..", import.meta.url))
const read = (path) => readFile(join(root, path), "utf8")

test("secure diagnostics persist redacted server-side events and restrict reads to owner MFA", async () => {
  const migration = await read("supabase/migrations/0003_secure_application_diagnostics.sql")
  const logger = await read("lib/secure-diagnostic.ts")
  const api = await read("app/api/admin/diagnostics/route.ts")
  const page = await read("app/admin/diagnostics/page.tsx")
  assert.match(migration, /enable row level security/i)
  assert.match(migration, /revoke all on table public\.secure_application_diagnostics from anon, authenticated/i)
  assert.match(logger, /createAdminClient/)
  assert.match(logger, /Never pass prompts, transcripts, audio/)
  assert.match(logger, /forge-secure-diagnostic/)
  assert.match(api, /requireOwnerAdmin/)
  assert.match(api, /limit\(100\)/)
  assert.match(api, /requireOwnerAdmin/)
  assert.match(api, /x-confirm-clear-diagnostics/)
  assert.match(api, /is_read/)
  assert.match(page, /currentLevel !== "aal2"/)
})

test("voice-session and transcription failures emit correlated diagnostics without raw errors", async () => {
  const route = await read("app/api/transcribe/session/route.ts")
  const transcribe = await read("app/api/transcribe/route.ts")
  assert.match(route, /recording_session_start_failed/)
  assert.match(route, /databaseErrorCode: insertError\?\.code/)
  assert.match(route, /recording_session_finish_failed/)
  assert.match(route, /recording_session_expired_cleanup_failed/)
  assert.match(route, /recording_session_cancel_failed/)
  assert.match(transcribe, /transcription_provider_failed/)
  assert.match(transcribe, /transcription_session_cleanup_failed/)
  assert.match(transcribe, /errorClass:/)
  assert.doesNotMatch(transcribe, /details: \{[^}]*message: error\.message/)
})
