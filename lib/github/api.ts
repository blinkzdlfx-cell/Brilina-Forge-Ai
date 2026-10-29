// Small GitHub REST client. It never logs tokens and always applies a timeout.
const API = "https://api.github.com"

export class GithubError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = "GithubError"
    this.status = status
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  body?: unknown
  accept?: string
  signal?: AbortSignal
  timeoutMs?: number
  text?: boolean
}

function friendly(status: number, message: string, rateRemaining: string | null) {
  if (status === 401) return "GitHub rejected the stored token. Reconnect GitHub in Plugins."
  if (status === 403 && rateRemaining === "0") return "GitHub rate limit reached. Try again later."
  if (status === 403) return `GitHub denied this action (${message}). The token may lack the needed permission.`
  if (status === 404) return "Not found, or the token cannot access it."
  if (status === 409) return `Conflict: ${message}`
  if (status === 422) return `GitHub rejected the request: ${message}`
  return `GitHub error ${status}: ${message}`
}

export async function githubWithHeaders<T = unknown>(
  token: string,
  path: string,
  options: RequestOptions = {}
): Promise<{ data: T; headers: Headers }> {
  const timeout = AbortSignal.timeout(options.timeoutMs ?? 20_000)
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout
  if (!path.startsWith("/") || path.startsWith("//")) throw new Error("Invalid GitHub API path.")
  const url = new URL(path, API)
  if (url.origin !== API) throw new Error("Invalid GitHub API host.")
  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers: {
      authorization: `Bearer ${token}`,
      accept: options.accept ?? "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "brilina-forge-ai",
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal,
    // GitHub's job-log endpoint redirects to a short-lived download URL. The
    // only text-mode caller is that endpoint; non-text API requests never
    // follow redirects, and fetch strips credentials on cross-origin hops.
    redirect: options.text ? "follow" : "error",
  })

  if (!response.ok) {
    let message = response.statusText
    try {
      const data = (await response.json()) as { message?: string; errors?: unknown }
      if (data.message) message = data.message
      if (Array.isArray(data.errors) && data.errors.length) {
        message += ` ${JSON.stringify(data.errors).slice(0, 300)}`
      }
    } catch {
      // Keep the status text.
    }
    throw new GithubError(
      response.status,
      friendly(response.status, message, response.headers.get("x-ratelimit-remaining"))
    )
  }

  if (response.status === 204) return { data: undefined as T, headers: response.headers }
  if (options.text) return { data: (await response.text()) as T, headers: response.headers }
  return { data: (await response.json()) as T, headers: response.headers }
}

export async function github<T = unknown>(
  token: string,
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  return (await githubWithHeaders<T>(token, path, options)).data
}

export function clip(text: string, max: number) {
  return text.length <= max ? text : `${text.slice(0, max)}\n…[truncated ${text.length - max} characters]`
}

export function decodeBase64Utf8(value: string) {
  const binary = atob(value.replace(/\s/g, ""))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

export function encodePath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/")
}
