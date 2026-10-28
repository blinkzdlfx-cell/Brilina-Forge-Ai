import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const source = (path) => readFile(new URL(path, import.meta.url), "utf8")

test("chat response disables intermediary buffering without replacing native UI-message streaming", async () => {
  const route = await source("../app/api/chat/route.ts")
  assert.match(route, /Cache-Control": "no-cache, no-transform"/)
  assert.match(route, /X-Accel-Buffering": "no"/)
  assert.match(route, /createUIMessageStreamResponse\(/)
  assert.match(route, /stream: toUIMessageStream\(\{\s*stream: result\.stream/)
})

test("streaming Markdown skips expensive syntax highlighting until the response completes", async () => {
  const textPart = await source("../components/parts/text-part.tsx")
  assert.match(textPart, /components=\{\{ pre: isStreaming \? StreamingPre : MarkdownPre \}\}/)
  assert.match(textPart, /animate-pulse/)
  assert.match(textPart, /Avoid expensive syntax highlighting on every streamed token/)
})

test("mixed attachments render in one responsive gallery and each item has its own preview action", async () => {
  const message = await source("../components/chat-message.tsx")
  assert.match(message, /fileParts\.map\(\(part, index\)/)
  assert.match(message, /grid-cols-2 gap-2 sm:grid-cols-3/)
  assert.match(message, /setPreviewAttachment\(\{/)
  assert.match(message, /object-contain/)
})

test("user message text remains natively selectable and copied selections are cleared", async () => {
  const message = await source("../components/chat-message.tsx")
  assert.match(message, /data-selectable-message-text/)
  assert.doesNotMatch(message, /TextSelectIcon|Select text/)
  assert.match(message, /window\.getSelection\(\)\?\.removeAllRanges\(\)/)
  const actions = await source("../components/message-actions.tsx")
  assert.match(actions, /setCopied\(true\); window\.getSelection\(\)\?\.removeAllRanges\(\)/)
})

test("profile photos can be previewed before upload and pinned chats lead the sidebar", async () => {
  const sidebar = await source("../components/chat-sidebar.tsx")
  assert.match(sidebar, /avatarPreviewUrl/)
  assert.match(sidebar, /avatarFullPreviewOpen/)
  assert.doesNotMatch(sidebar, /Preview full photo/)
  assert.match(sidebar, /aria-label=\{\(avatarPreviewUrl \|\| avatarUrl\) \? "Preview profile photo" : "Choose profile photo"\}/)
  assert.match(sidebar, /className="z-\[110\]"/)
  assert.match(sidebar, /Full-size profile photo/)
  assert.match(sidebar, /Save photo/)
  assert.match(sidebar, /pinned\.length > 0 \? "Pinned" : "Recent"/)
})

test("restored conversations follow layout growth while auto-follow remains enabled", async () => {
  const chat = await source("../components/chat.tsx")
  assert.match(chat, /new ResizeObserver\(/)
  assert.match(chat, /viewport\.scrollTop = viewport\.scrollHeight/)
  assert.match(chat, /if \(!shouldAutoFollowRef\.current && !forceScrollToLatestRef\.current\) return/)
})
