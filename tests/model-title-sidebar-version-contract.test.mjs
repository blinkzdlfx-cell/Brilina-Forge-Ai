import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8")

test("the model registry exposes configured Gemini and expanded Cloudflare text models", async () => {
  const models = await read("lib/models.ts")
  const selector = await read("components/model-select.tsx")
  assert.match(models, /GOOGLE_GENERATIVE_AI_API_KEY/)
  assert.match(models, /Gemini 2\.5 Flash/)
  assert.match(models, /Gemini 2\.5 Flash-Lite/)
  assert.match(models, /@cf\/google\/gemma-4-26b-a4b-it/)
  assert.match(models, /@cf\/nvidia\/nemotron-3-120b-a12b/)
  assert.match(models, /@cf\/openai\/gpt-oss-120b/)
  assert.doesNotMatch(models, /@cf\/zai-org\/glm-5\.3/)
  assert.doesNotMatch(models, /@cf\/moonshotai\/kimi-k2\.7-code/)
  assert.match(models, /generativelanguage\.googleapis\.com\/v1beta\/openai/)
  assert.match(models, /selectable: false/)
  assert.match(selector, /model\.selectable !== false/)
  assert.match(selector, /model\.capabilities\?\.includes\("text"\)/)
  const themeProvider = await read("components/theme-provider.tsx")
  assert.match(themeProvider, /window\.localStorage\.getItem\("theme"\)/)
  assert.match(themeProvider, /if \(active && !hasLocalChoice/)
  assert.match(themeProvider, /profile fetch overwrite a newer choice/)
})

test("new conversations receive AI-generated titles without replacing manual names", async () => {
  const createRoute = await read("app/api/conversations/route.ts")
  const titleRoute = await read("app/api/conversations/[conversationId]/title/route.ts")
  const chat = await read("components/chat.tsx")
  const backgroundRoute = await read("app/api/jobs/route.ts")
  assert.match(createRoute, /title/)
  assert.match(titleRoute, /getLanguageModel\(CLOUDFLARE_TITLE_MODEL_ID\)/)
  assert.match(titleRoute, /generateText/)
  assert.match(titleRoute, /conversation\.title !== "New chat"/)
  assert.match(titleRoute, /\.eq\("title", "New chat"\)/)
  assert.match(chat, /JSON\.stringify\(\{ title: "New chat" \}\)/)
  assert.match(chat, /\/title", \{ method: "POST" \}/)
  assert.match(chat, /document\.title =/)
  assert.doesNotMatch(backgroundRoute, /title: prompt\.slice\(0, 64\)/)
  const messagePersistenceRoute = await read("app/api/conversations/[conversationId]/messages/route.ts")
  assert.match(chat, /localStorage\.getItem\(modelStorageKey\)/)
  assert.match(chat, /localStorage\.setItem\(modelStorageKey, nextModel\)/)
  assert.match(chat, /sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls/)
  assert.match(chat, /options: \{ body: \{ model: resolvedModel, conversationId: conversationIdRef\.current \} \}/)
  assert.doesNotMatch(messagePersistenceRoute, /extractTitle\(/)
  assert.match(messagePersistenceRoute, /dedicated AI title endpoint/)
})

test("new-chat suggestions use icons and no longer promote the default Next.js prompt", async () => {
  const suggestions = await read("components/suggestions.tsx")
  assert.match(suggestions, /BookOpenIcon/)
  assert.match(suggestions, /SearchIcon/)
  assert.match(suggestions, /UtensilsIcon/)
  assert.match(suggestions, /suggestion\.icon/)
  assert.doesNotMatch(suggestions, /What's new in Next\.js/)
})

test("collapsed sidebar hides conversation rows and retains the profile image control", async () => {
  const sidebar = await read("components/chat-sidebar.tsx")
  assert.match(sidebar, /group-data-\[collapsible=icon\]:hidden">\s*\n\s*<SidebarMenuButton/)
  assert.match(sidebar, /group-data-\[collapsible=icon\]:flex/)
  assert.match(sidebar, /avatarUrl/)
})

test("response version navigation is an action icon with an on-demand selector", async () => {
  const message = await read("components/chat-message.tsx")
  assert.match(message, /HistoryIcon/)
  assert.match(message, /Choose response version/)
  assert.match(message, /Select response version/)
  assert.match(message, /setVersionSelectorOpen/)
})
