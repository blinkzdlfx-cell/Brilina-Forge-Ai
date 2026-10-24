import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8")

test("file upload requires a user, caps payloads, validates types, and stores private object references", async () => {
  const route = await read("app/api/files/route.ts")
  assert.match(route, /requireUser/)
  assert.match(route, /MAX_FILE_BYTES/)
  assert.match(route, /ALLOWED_TYPES/)
  assert.match(route, /hasExpectedSignature/)
  assert.match(route, /forge-private-files/)
  assert.match(route, /storage_path: storagePath/)
  assert.match(route, /remove\(\[storagePath\]\)/)
})

test("file access creates short-lived signed URLs only after owner-scoped metadata lookup", async () => {
  const route = await read("app/api/files/[fileId]/route.ts")
  assert.match(route, /\.eq\("user_id", auth\.user\.id\)/)
  assert.match(route, /createSignedUrl\(file\.storage_path, 60\)/)
  assert.match(route, /export async function DELETE/)
  assert.match(route, /storage\.from\(BUCKET\)\.remove/)
})
