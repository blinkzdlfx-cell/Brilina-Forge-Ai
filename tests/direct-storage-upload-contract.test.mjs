import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8")

test("attachment bytes upload directly to private storage and metadata is verified server-side", async () => {
  const client = await read("components/chat.tsx")
  const init = await read("app/api/files/upload-url/route.ts")
  const complete = await read("app/api/files/complete-upload/route.ts")
  assert.match(client, /\/api\/files\/upload-url/)
  assert.match(client, /initPayload\.upload\.signedUrl/)
  assert.match(client, /\/api\/files\/complete-upload/)
  assert.doesNotMatch(client, /FormData\(\)[\s\S]{0,100}fetch\("\/api\/files"/)
  assert.match(init, /requireUser/)
  assert.match(init, /createSignedUploadUrl/)
  assert.match(init, /\.eq\("user_id", auth\.user\.id\)/)
  assert.match(complete, /requireUser/)
  assert.match(complete, /storagePath\.split\( "\/"/.source.replaceAll(" ", ""))
  assert.match(complete, /hasExpectedSignature/)
  assert.match(complete, /\.eq\("user_id", auth\.user\.id\)/)
  assert.match(complete, /if \(existing\) return Response\.json\(\{ file: existing \}/)
})

test("audio bytes upload directly to a private 20 MiB bucket and transcription accepts only the user's recording-session path", async () => {
  const form = await read("components/prompt-form.tsx")
  const upload = await read("app/api/transcribe/upload-url/route.ts")
  const route = await read("app/api/transcribe/route.ts")
  const migration = await read("supabase/migrations/0007_private_audio_storage.sql")
  assert.match(form, /\/api\/transcribe\/upload-url/)
  assert.match(form, /storagePath: initPayload\.upload\.storagePath/)
  assert.match(form, /body: blob/)
  assert.match(upload, /requireUser/)
  assert.match(upload, /MAX_AUDIO_BYTES = 20 \* 1024 \* 1024/)
  assert.match(upload, /\.eq\("user_id", auth\.user\.id\)/)
  assert.match(upload, /createSignedUploadUrl/)
  assert.match(route, /forge-private-audio/)
  assert.match(route, /pathParts\[0\] !== context\.user\.id/)
  assert.match(route, /pathParts\[1\] !== session\.id/)
  assert.match(route, /audioStoragePath/)
  assert.match(migration, /'forge-private-audio',[\s\S]*?false,[\s\S]*?20971520/i)
  for (const operation of ["select", "insert", "update", "delete"]) {
    assert.ok(migration.includes("forge_private_audio_" + operation + "_own"))
  }
})
