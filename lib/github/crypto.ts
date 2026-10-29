import { getRuntimeEnv } from "../runtime-env"

// Tokens are encrypted at rest with AES-GCM. The key comes from
// GITHUB_TOKEN_ENCRYPTION_KEY when set, otherwise it is derived from the
// service-role key so the plugin works with no extra configuration.
async function getKey() {
  const secret =
    getRuntimeEnv("GITHUB_TOKEN_ENCRYPTION_KEY") ??
    getRuntimeEnv("SUPABASE_SERVICE_ROLE_KEY")
  if (!secret) throw new Error("GitHub token encryption is not configured.")
  const material = new TextEncoder().encode(`forge-github-token:v1:${secret}`)
  const digest = await crypto.subtle.digest("SHA-256", material)
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ])
}

function toBase64(bytes: Uint8Array) {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64(value: string) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export async function encryptToken(token: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await getKey()
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(token)
    )
  )
  return `v1.${toBase64(iv)}.${toBase64(cipher)}`
}

export async function decryptToken(payload: string) {
  const [version, ivPart, cipherPart] = payload.split(".")
  if (version !== "v1" || !ivPart || !cipherPart) {
    throw new Error("Stored GitHub token is unreadable.")
  }
  const key = await getKey()
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(ivPart) },
    key,
    fromBase64(cipherPart)
  )
  return new TextDecoder().decode(plain)
}
