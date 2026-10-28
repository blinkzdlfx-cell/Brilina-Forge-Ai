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
    read("supabase/migrations/20261028105759_durable_chat_streams.sql"),
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

test("collapsed sidebar exposes the four requested actions and model labels omit providers", async () => {
  const [sidebar, header, modelSelect, models] = await Promise.all([
    read("components/chat-sidebar.tsx"),
    read("components/chat-header-controls.tsx"),
    read("components/model-select.tsx"),
    read("lib/models.ts"),
  ])
  assert.match(sidebar, /aria-label="Recent conversations" title="Recent conversations"/)
  assert.match(sidebar, /aria-label="Search conversations" title="Search conversations"/)
  assert.match(sidebar, /aria-label="Pinned conversations" title="Pinned conversations"/)
  assert.match(sidebar, /aria-label="New chat" title="New chat"/)
  assert.match(sidebar, /<MessagesSquareIcon className="size-4" \/>/)
  assert.doesNotMatch(header, /BRILINAFORGE/)
  assert.match(header, /<ModelSelect models=\{models\} value=\{model\} onValueChange=\{onModelChange\} \/>/)
  assert.match(modelSelect, /<SelectValue placeholder="Choose model" \/>/)
  assert.doesNotMatch(models, /\(Cloudflare\)|\(Groq\)/)
  assert.doesNotMatch(sidebar, /Preview full photo/)
  assert.match(sidebar, /className="z-\[110\]"/)
})

test("new-chat submissions use the latest chat instance and initial loading cannot overwrite a later selection", async () => {
  const chat = await read("components/chat.tsx")
  assert.match(chat, /const sendMessageRef = React\.useRef\(sendMessage\)/)
  assert.match(chat, /sendMessageRef\.current\(\{ text \}/)
  assert.match(chat, /conversationIdRef\.current !== initialConversationId/)
  assert.match(chat, /shouldPersistMessagesRef = React\.useRef\(false\)/)
  assert.match(chat, /!shouldPersistMessagesRef\.current/)
})

test("long AI responses use Vercel Fluid Compute duration", async () => {
  const route = await read("app/api/chat/route.ts")
  assert.match(route, /export const maxDuration = 300/)
  assert.match(route, /timeout: \{ totalMs: 270_000, stepMs: 90_000 \}/)
})
