import { readJsonWithinLimit } from "./bounded-request.mjs"

const MAX_RESULTS = 5
const MAX_CONTENT_LENGTH = 1200
const MAX_RESPONSE_BYTES = 128 * 1024
const SEARCH_ENDPOINT = "https://api.tavily.com/search"
const TRACKING_PARAMS = new Set(["fbclid", "gclid", "mc_cid", "mc_eid"])

function safeHttpsUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === "https:" ? url.toString() : null
  } catch {
    return null
  }
}

function normalizedUrlKey(value) {
  const url = new URL(value)
  url.hash = ""
  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase().startsWith("utm_") || TRACKING_PARAMS.has(key.toLowerCase())) {
      url.searchParams.delete(key)
    }
  }
  url.searchParams.sort()
  return url.toString()
}

function safeHttpError(status) {
  if (status === 429) return "The web search service rate limit was reached. Try again later."
  if (status >= 500) return "The web search service is temporarily unavailable."
  return "The web search request was rejected. Check the Tavily API configuration."
}

function retryDelayMs(retryAfter, fallbackMs) {
  if (!retryAfter) return fallbackMs
  const seconds = Number(retryAfter)
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000
  const date = Date.parse(retryAfter)
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : fallbackMs
}

function waitForRetry(delayMs, signal) {
  if (delayMs <= 0) return Promise.resolve()
  if (signal.aborted) {
    return Promise.reject(signal.reason ?? new DOMException("Aborted", "AbortError"))
  }

  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer)
      signal.removeEventListener("abort", onAbort)
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"))
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort)
      resolve()
    }, delayMs)
    signal.addEventListener("abort", onAbort, { once: true })
  })
}

export async function searchTavily(
  query,
  {
    apiKey = process.env.TAVILY_API_KEY,
    fetchImpl = fetch,
    signal,
    timeoutMs = 10000,
  } = {},
) {
  const normalizedQuery = typeof query === "string" ? query.trim() : ""

  if (normalizedQuery.length < 2 || normalizedQuery.length > 400) {
    return { query: normalizedQuery, results: [], error: "Enter a search query between 2 and 400 characters." }
  }

  if (!apiKey) {
    return { query: normalizedQuery, results: [], error: "Web search is not configured. Set TAVILY_API_KEY in the deployment environment." }
  }

  const timeoutSignal = AbortSignal.timeout(timeoutMs)
  const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal
  let response

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      response = await fetchImpl(SEARCH_ENDPOINT, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          api_key: apiKey,
          query: normalizedQuery,
          search_depth: "basic",
          topic: "general",
          max_results: MAX_RESULTS,
          include_answer: false,
          include_raw_content: false,
        }),
        signal: requestSignal,
      })
    } catch (error) {
      const aborted = signal?.aborted
      const timedOut = timeoutSignal.aborted || error?.name === "TimeoutError"
      return {
        query: normalizedQuery,
        results: [],
        error: aborted
          ? "Web search was cancelled."
          : timedOut
            ? "Web search timed out. Try again."
            : "Could not reach the web search service.",
      }
    }

    const retryableStatus = response.status === 429 || response.status >= 500
    if (retryableStatus && attempt === 0 && !requestSignal.aborted) {
      const fallbackDelay = response.status === 429 ? 500 : 200
      const delayMs = retryDelayMs(response.headers.get("retry-after"), fallbackDelay)
      // Keep one retry inside the total request budget and never retry earlier
      // than Retry-After asks us to.
      if (delayMs < timeoutMs) {
        await response.body?.cancel().catch(() => undefined)
        try {
          await waitForRetry(delayMs, requestSignal)
        } catch {
          return {
            query: normalizedQuery,
            results: [],
            error: signal?.aborted ? "Web search was cancelled." : "Web search timed out. Try again.",
          }
        }
        continue
      }
    }

    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined)
      return { query: normalizedQuery, results: [], error: safeHttpError(response.status) }
    }
    break
  }

  if (!response?.ok) {
    return { query: normalizedQuery, results: [], error: "The web search service is temporarily unavailable." }
  }

  const parsed = await readJsonWithinLimit(response, MAX_RESPONSE_BYTES)
  if (!parsed.ok) {
    if (signal?.aborted) {
      return { query: normalizedQuery, results: [], error: "Web search was cancelled." }
    }
    if (timeoutSignal.aborted || parsed.reason === "read_error") {
      return { query: normalizedQuery, results: [], error: "Web search timed out. Try again." }
    }
    return {
      query: normalizedQuery,
      results: [],
      error: parsed.reason === "too_large"
        ? "The web search response was too large to process safely."
        : "The web search service returned an invalid response.",
    }
  }

  const payload = parsed.value
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.results)) {
    return { query: normalizedQuery, results: [], error: "The web search service returned an invalid response." }
  }

  const rawResults = payload.results
  const seen = new Set()
  const results = []
  let invalidResultCount = 0
  let duplicateCount = 0
  const inspectLimit = Math.min(rawResults.length, MAX_RESULTS * 2)

  for (const item of rawResults.slice(0, inspectLimit)) {
    const url = safeHttpsUrl(item?.url)
    if (!url || !item || typeof item !== "object") {
      invalidResultCount += 1
      continue
    }

    let key
    try {
      key = normalizedUrlKey(url)
    } catch {
      invalidResultCount += 1
      continue
    }
    if (seen.has(key)) {
      duplicateCount += 1
      continue
    }
    seen.add(key)

    results.push({
      title: String(item.title ?? new URL(url).hostname).slice(0, 240),
      url,
      content: String(item.content ?? "").slice(0, MAX_CONTENT_LENGTH),
      ...(item.published_date
        ? { publishedDate: String(item.published_date).slice(0, 80) }
        : {}),
    })
    if (results.length >= MAX_RESULTS) break
  }

  const providerTruncated = rawResults.length > inspectLimit
  const partial = invalidResultCount > 0 || providerTruncated
  return {
    query: normalizedQuery,
    results,
    ...(partial
      ? {
          partial: true,
          error: "Some search results were omitted because the provider returned invalid or excessive result data.",
        }
      : {}),
    ...(duplicateCount > 0 ? { deduplicatedCount: duplicateCount } : {}),
  }
}
