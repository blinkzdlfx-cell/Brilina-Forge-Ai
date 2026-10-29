import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8")

test("Vercel's native Next.js production build is covered independently of adapter builds", async () => {
  const pkg = JSON.parse(await read("package.json"))
  const workflow = await read(".github/workflows/ci.yml")

  assert.equal(pkg.scripts.build, "next build")
  assert.match(workflow, /Native Next\.js production build \(Vercel runtime\)/)
  assert.match(workflow, /run: pnpm build\r?\n/)
  assert.match(workflow, /run: pnpm build:worker/)
  assert.doesNotMatch(workflow, /Cloud Run container build|docker build --tag brilina-forge-ai:ci/)
  const netlifyWorker = await read("netlify/functions/process-forge-job.mts")
  assert.match(netlifyWorker, /background: true/)
})

test("chat keeps native AI SDK streaming and route-specific duration bounds", async () => {
  const route = await read("app/api/chat/route.ts")

  assert.match(route, /export const maxDuration\s*=\s*\d+/)
  assert.match(route, /streamText/)
  assert.match(route, /toUIMessageStream/)
  assert.match(route, /createUIMessageStreamResponse/)
  assert.doesNotMatch(route, /await\s+.*\.text\(\).*stream/i)
})

test("runtime configuration retains process.env fallback for non-Cloudflare hosts", async () => {
  const helper = await read("lib/runtime-env.ts")

  assert.match(helper, /getCloudflareContext/)
  assert.match(helper, /process\.env\[name\]/)
  assert.match(helper, /catch/)
})

test("Vercel compatibility tests do not weaken existing authenticated file and transcription routes", async () => {
  const files = await read("app/api/files/route.ts")
  const transcription = await read("app/api/transcribe/route.ts")

  assert.match(files, /direct_upload_required/)
  const uploadIntent = await read("app/api/files/upload-intent/route.ts")
  assert.match(uploadIntent, /requireUser/)
  assert.match(uploadIntent, /createSignedUploadUrl/)
  assert.match(transcription, /requireUser/)
  assert.match(transcription, /MAX_RECORDING_MS\s*=\s*10\s*\*\s*60\s*\*\s*1000/)
})
