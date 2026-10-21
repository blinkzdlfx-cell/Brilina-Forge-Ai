import assert from "node:assert/strict"
import test from "node:test"

import { validateImageParts } from "../lib/image-input.mjs"

function imagePart({ mediaType = "image/png", bytes = 12, url } = {}) {
  const encoded = "A".repeat(Math.ceil(bytes / 3) * 4).replace(/=+$/, "")
  return {
    type: "file",
    mediaType,
    filename: "image.png",
    url: url ?? `data:${mediaType};base64,${encoded}`,
  }
}

const message = (...parts) => ({ role: "user", parts })

test("accepts bounded supported images for a vision model", () => {
  const result = validateImageParts([message(imagePart(), imagePart({ mediaType: "image/jpeg" }))], {
    modelSupportsVision: true,
    maxImages: 3,
  })
  assert.equal(result.ok, true)
  if (result.ok) assert.equal(result.imageCount, 2)
})

test("rejects images when a text-only model is selected", () => {
  const result = validateImageParts([message(imagePart())], {
    modelSupportsVision: false,
    maxImages: 0,
  })
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.reason, "model_not_vision")
})

test("enforces the selected model image-count limit", () => {
  const result = validateImageParts([message(imagePart(), imagePart())], {
    modelSupportsVision: true,
    maxImages: 1,
  })
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.reason, "too_many_images")
})

test("rejects unsupported MIME types and non-data URLs", () => {
  const unsupported = validateImageParts([message(imagePart({ mediaType: "image/gif" }))], {
    modelSupportsVision: true,
    maxImages: 3,
  })
  assert.equal(unsupported.ok, false)
  if (!unsupported.ok) assert.equal(unsupported.reason, "unsupported_file_type")

  const remote = validateImageParts([message(imagePart({ url: "https://example.com/image.png" }))], {
    modelSupportsVision: true,
    maxImages: 3,
  })
  assert.equal(remote.ok, false)
  if (!remote.ok) assert.equal(remote.reason, "invalid_image_data")
})

test("rejects oversized images and aggregate image payloads", () => {
  const single = validateImageParts([message(imagePart({ bytes: 1024 * 1024 + 3 }))], {
    modelSupportsVision: true,
    maxImages: 3,
  })
  assert.equal(single.ok, false)
  if (!single.ok) assert.equal(single.reason, "image_too_large")

  const aggregate = validateImageParts([message(
    imagePart({ bytes: 600 }),
    imagePart({ bytes: 600 }),
  )], {
    modelSupportsVision: true,
    maxImages: 3,
    maxImageBytes: 1024,
    maxTotalImageBytes: 1000,
  })
  assert.equal(aggregate.ok, false)
  if (!aggregate.ok) assert.equal(aggregate.reason, "total_image_size_exceeded")
})
