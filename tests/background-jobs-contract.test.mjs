import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const activity = await readFile(new URL("../components/activity-status.tsx", import.meta.url), "utf8")
const chat = await readFile(new URL("../components/chat.tsx", import.meta.url), "utf8")
const promptForm = await readFile(new URL("../components/prompt-form.tsx", import.meta.url), "utf8")
const preferences = await readFile(new URL("../lib/personalization.ts", import.meta.url), "utf8")
const preferencesRoute = await readFile(new URL("../app/api/profile/preferences/route.ts", import.meta.url), "utf8")
const jobsRoute = await readFile(new URL("../app/api/jobs/route.ts", import.meta.url), "utf8")
const jobStatusRoute = await readFile(new URL("../app/api/jobs/[jobId]/route.ts", import.meta.url), "utf8")
const worker = await readFile(new URL("../netlify/functions/process-forge-job.mts", import.meta.url), "utf8")
const migration = await readFile(new URL("../supabase/migrations/20261028173000_background_jobs.sql", import.meta.url), "utf8")

test("the chat has 50–60 rotating activity messages", () => {
  const list = activity.slice(activity.indexOf("export const ACTIVITY_MESSAGES"), activity.indexOf("] as const"))
  const count = [...list.matchAll(/^\s+"[^"]+",?$/gm)].length
  assert.ok(count >= 50 && count <= 60, `Expected 50–60 status messages, received ${count}`)
  assert.match(activity, /setInterval/)
  assert.match(chat, /hasPendingSubmission/)
  assert.match(chat, /requestAnimationFrame/)
  assert.match(chat, /void refreshConversations\(\)\.catch/)
})

test("background mode is explicit and restores a durable job after refresh", () => {
  assert.match(promptForm, /Background task/)
  assert.match(chat, /fetch\("\/api\/jobs\?conversationId=/)
  assert.match(chat, /BackgroundJobPanel/)
  assert.match(jobsRoute, /NETLIFY_BACKGROUND_FUNCTION_URL/)
  assert.match(jobStatusRoute, /background_job_events/)
})

test("personalization includes themes and persists authenticated preferences", () => {
  assert.match(preferences, /theme: "system" \| "light" \| "dark"/)
  assert.match(preferences, /responseStyle/)
  assert.match(preferences, /approvalBeforeMerge/)
  assert.match(preferencesRoute, /auth\.supabase\.auth\.updateUser/)
})

test("background jobs are durable, owner-scoped, and processed by Netlify", () => {
  assert.match(migration, /create table if not exists public\.background_jobs/)
  assert.match(migration, /create table if not exists public\.background_job_events/)
  assert.match(migration, /enable row level security/)
  assert.match(worker, /background: true/)
  assert.match(worker, /NETLIFY_WORKER_SECRET/)
  assert.match(worker, /timeout: \{ totalMs: 9 \* 60 \* 1000/)
  assert.match(worker, /background-job-/)
})
