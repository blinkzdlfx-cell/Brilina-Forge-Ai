const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"])
const DATA_URL_PREFIX = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]*={0,2})$/

/**
 * Validate image file parts before they reach a model provider.
 * The size limits here are application safety limits, not provider maximums.
 *
 * @param {unknown[]} messages
 * @param {{ modelSupportsVision: boolean, maxImages: number, maxImageBytes?: number, maxTotalImageBytes?: number }} options
 * @returns {{ ok: true, imageCount: number, totalImageBytes: number } | { ok: false, reason: "model_not_vision" | "unsupported_file_type" | "invalid_image_data" | "too_many_images" | "image_too_large" | "total_image_size_exceeded", imageCount: number, totalImageBytes: number }}
 */
export function validateImageParts(messages, options) {
  const maxImageBytes = options.maxImageBytes ?? 1024 * 1024
  const maxTotalImageBytes = options.maxTotalImageBytes ?? 3 * 1024 * 1024
  let imageCount = 0
  let totalImageBytes = 0

  for (const rawMessage of messages) {
    if (!rawMessage || typeof rawMessage !== "object") continue
    const message = /** @type {Record<string, unknown>} */ (rawMessage)
    if (message.role !== "user" || !Array.isArray(message.parts)) continue

    for (const rawPart of message.parts) {
      if (!rawPart || typeof rawPart !== "object") continue
      const part = /** @type {Record<string, unknown>} */ (rawPart)
      if (part.type !== "file") continue
      if (typeof part.mediaType !== "string" || !part.mediaType.startsWith("image/")) {
        return { ok: false, reason: "unsupported_file_type", imageCount, totalImageBytes }
      }
      if (!ALLOWED_IMAGE_TYPES.has(part.mediaType) || typeof part.url !== "string") {
        return { ok: false, reason: "unsupported_file_type", imageCount, totalImageBytes }
      }

      const match = DATA_URL_PREFIX.exec(part.url)
      if (!match || match[1] !== part.mediaType) {
        return { ok: false, reason: "invalid_image_data", imageCount, totalImageBytes }
      }

      const encoded = match[2]
      const padding = encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0
      const imageBytes = Math.floor((encoded.length * 3) / 4) - padding
      if (imageBytes <= 0) {
        return { ok: false, reason: "invalid_image_data", imageCount, totalImageBytes }
      }
      if (imageBytes > maxImageBytes) {
        return { ok: false, reason: "image_too_large", imageCount: imageCount + 1, totalImageBytes: totalImageBytes + imageBytes }
      }

      imageCount += 1
      totalImageBytes += imageBytes
      if (imageCount > options.maxImages) {
        return { ok: false, reason: "too_many_images", imageCount, totalImageBytes }
      }
      if (totalImageBytes > maxTotalImageBytes) {
        return { ok: false, reason: "total_image_size_exceeded", imageCount, totalImageBytes }
      }
    }
  }

  if (imageCount > 0 && !options.modelSupportsVision) {
    return { ok: false, reason: "model_not_vision", imageCount, totalImageBytes }
  }

  return { ok: true, imageCount, totalImageBytes }
}
