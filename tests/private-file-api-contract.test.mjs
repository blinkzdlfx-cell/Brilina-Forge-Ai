import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8")

test("file bytes bypass Vercel Functions through authenticated signed private-storage uploads", async () => {
  const legacyRoute = await read("app/api/files/route.ts")
  const intent = await read("app/api/files/upload-intent/route.ts")
  const complete = await read("app/api/files/[fileId]/complete/route.ts")
  const client = await read("lib/direct-upload.ts")
  assert.match(legacyRoute, /direct_upload_required/)
  assert.match(legacyRoute, /status: 410/)
  assert.match(intent, /requireUser/)
  assert.match(intent, /createSignedUploadUrl/)
  assert.match(intent, /forge-private-files/)
  assert.match(intent, /MAX_FILE_BYTES/)
  assert.match(intent, /MAX_AUDIO_BYTES/)
  assert.match(intent, /\.eq\("user_id", auth\.user\.id\)/)
  assert.match(complete, /forge-private-audio/)
  assert.match(complete, /actualSize = Number\(object\?\.metadata/)
  assert.match(complete, /\.eq\("user_id", auth\.user\.id\)/)
  assert.match(client, /uploadToSignedUrl/)
  assert.match(client, /\/complete/)
  assert.match(client, /method: "DELETE"/)
  const processRoute = await read("app/api/files/[fileId]/process/route.ts")
  assert.match(processRoute, /file_upload_not_complete/)
  assert.match(processRoute, /file_signature_mismatch/)
})

test("file access creates short-lived signed URLs only after owner-scoped metadata lookup", async () => {
  const route = await read("app/api/files/[fileId]/route.ts")
  assert.match(route, /\.eq\("user_id", auth\.user\.id\)/)
  assert.match(route, /createSignedUrl\(file\.storage_path, 60\)/)
  assert.match(route, /export async function DELETE/)
  assert.match(route, /storage\.from\(file\.bucket_id\)\.remove/)
})

test("audio transcription accepts a private file reference instead of binary request bodies", async () => {
  const route = await read("app/api/transcribe/route.ts")
  const prompt = await read("components/prompt-form.tsx")
  assert.match(route, /forge-private-audio/)
  assert.match(route, /request\.json\(\)/)
  assert.match(route, /admin\.storage\s*\.from\("forge-private-audio"\)\.download/)
  assert.match(route, /storage\.from\("forge-private-audio"\)\s*\.download/)
  assert.doesNotMatch(route, /request\.arrayBuffer\(\)/)
  assert.match(prompt, /uploadPrivateFile\(audioFile, null, "audio"\)/)
  assert.match(prompt, /JSON\.stringify\(\{ fileId: audioFileId \}\)/)
})

test("private audio bucket is private and capped at 20 MiB", async () => {
  const migration = await read("supabase/migrations/0007_private_audio_storage.sql")
  assert.match(migration, /'forge-private-audio',[\s\S]*?false,[\s\S]*?20971520/i)
  for (const operation of ["select", "insert", "update", "delete"]) {
    assert.match(migration, new RegExp("forge_private_audio_" + operation + "_own"))
  }
})
