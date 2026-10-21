/**
 * Read and parse JSON without buffering more than the configured byte limit.
 *
 * @param {{ body: ReadableStream<Uint8Array> | null }} request
 * @param {number} maxBytes
 * @returns {Promise<{ok: true, value: unknown, bytesRead: number} | {ok: false, reason: "too_large" | "invalid_json" | "read_error", bytesRead: number}>}
 */
export async function readJsonWithinLimit(request, maxBytes) {
  const reader = request.body?.getReader()
  if (!reader) return { ok: false, reason: "invalid_json", bytesRead: 0 }

  /** @type {Uint8Array[]} */
  const chunks = []
  let bytesRead = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue

      bytesRead += value.byteLength
      if (bytesRead > maxBytes) {
        await reader.cancel("request body size limit exceeded").catch(() => undefined)
        return { ok: false, reason: "too_large", bytesRead }
      }
      chunks.push(value)
    }

    const bytes = new Uint8Array(bytesRead)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }

    let text
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
    } catch {
      return { ok: false, reason: "invalid_json", bytesRead }
    }

    try {
      return { ok: true, value: JSON.parse(text), bytesRead }
    } catch {
      return { ok: false, reason: "invalid_json", bytesRead }
    }
  } catch {
    return { ok: false, reason: "read_error", bytesRead }
  } finally {
    try {
      reader.releaseLock()
    } catch {
      // The reader may already have been released by the runtime.
    }
  }
}
