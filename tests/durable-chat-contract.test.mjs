import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const root = new URL("../", import.meta.url)
const read = (path) => readFile(new URL(path, root), "utf8")

test("durable stream recovery uses an authenticated resumable stream and explicit stop path", async () => {
  const [chatRoute, resumeRoute, stopRoute, context] = await Promise.all([
    read("app/api/chat/route.ts"),
    read("app/api/chat/[id]/stream/route.ts"),
    read("app/api/chat/stop/route.ts"),
    read("lib/resumable-stream-context.ts"),
  ])
  assert.match(chatRoute, /createNewResumableStream\(streamId/)
  assert.match(chatRoute, /generationAbortController\.signal/)
  assert.match(chatRoute, /active_stream_id: streamId/)
  assert.match(resumeRoute, /requireUser\(\)/)
  assert.match(resumeRoute, /resumeExistingStream/)
  assert.match(stopRoute, /active_generation_status: "stopped"/)
  assert.match(context, /REDIS_URL/)
  assert.match(context, /await Promise\.all\(\[publisher\.connect\(\), subscriber\.connect\(\)\]\)/)
  assert.match(context, /publisher, subscriber/)
  const redisClient = await read("lib/redis-client.ts")
  assert.match(redisClient, /servername: parsed\.hostname/)
  assert.match(redisClient, /createRedisClient/)
})

test("conversation API keeps response versions while exposing only the active branch", async () => {
  const [conversationRoute, versionRoute, branchRoute, migration] = await Promise.all([
    read("app/api/conversations/[conversationId]/route.ts"),
    read("app/api/conversations/[conversationId]/versions/route.ts"),
    read("app/api/conversations/[conversationId]/branch/route.ts"),
    read("supabase/migrations/202610280001_durable_chat_streams.sql"),
  ])
  assert.match(conversationRoute, /versionCounts/)
  assert.match(conversationRoute, /filter\(\(row\) => row\.is_active_version !== false\)/)
  assert.match(versionRoute, /is_active_version/)
  assert.match(branchRoute, /gte\("sequence_number"/)
  assert.match(migration, /turn_message_id text/)
  assert.match(migration, /version_number integer/)
  assert.match(migration, /is_active_version boolean/)
})

test("recording and attachment selection stay available while a response is active", async () => {
  const promptForm = await read("components/prompt-form.tsx")
  assert.doesNotMatch(promptForm, /if \(isBusy \|\| voiceState === "transcribing"/)
  assert.doesNotMatch(promptForm, /aria-label="Add attachment"[^\n]*disabled=\{isBusy/)
  assert.doesNotMatch(promptForm, /aria-label="Record voice message"[^\n]*disabled=\{isBusy/)
})
