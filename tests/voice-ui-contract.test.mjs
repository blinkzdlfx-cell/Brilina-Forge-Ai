import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8")

test("voice UI: ring wraps the stop button, no instruction text, X and send remain", async () => {
  const form = await read("components/prompt-form.tsx")
  assert.match(form, /<WaveformRing level=\{waveformLevel\}>\s*<InputGroupButton[^>]*aria-label="Stop and transcribe without sending"/)
  assert.doesNotMatch(form, /Listening…|Tap to retry/)
  assert.match(form, /aria-label="Discard recording"/)
  assert.match(form, /aria-label="Retry transcription"/)
  assert.doesNotMatch(form, /Cancel audio/)
})

test("voice send uses the latest submit handler and attachments, not stale closures", async () => {
  const form = await read("components/prompt-form.tsx")
  assert.match(form, /onSubmitRef\.current\(combined, selectedImagesRef\.current, false\)/)
})

test("client transcription timeout exceeds the server provider timeout", async () => {
  const form = await read("components/prompt-form.tsx")
  const route = await read("app/api/transcribe/route.ts")
  const client = Number(form.match(/TRANSCRIPTION_TIMEOUT_MS = ([\d_]+)/)[1].replaceAll("_", ""))
  const server = Number(route.match(/AbortSignal\.timeout\(([\d_]+)\)/)[1].replaceAll("_", ""))
  const duration = Number(route.match(/export const maxDuration = (\d+)/)[1])
  assert.ok(client > server, "browser must not give up before the server does")
  assert.ok(duration * 1000 > server, "function duration must cover the provider timeout")
})

test("recordings stay under the 20 MB upload limit at the configured bitrate", async () => {
  const form = await read("components/prompt-form.tsx")
  const bitrate = Number(form.match(/audioBitsPerSecond: ([\d_]+)/)[1].replaceAll("_", ""))
  const tenMinuteBytes = (bitrate / 8) * 600
  assert.ok(tenMinuteBytes < 20 * 1024 * 1024 * 0.6)
})

test("background jobs are rate limited", async () => {
  assert.match(await read("app/api/jobs/route.ts"), /checkRateLimit\(`background-job:/)
})
