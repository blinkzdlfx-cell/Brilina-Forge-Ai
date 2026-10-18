const MAX_RESULTS = 5
const MAX_CONTENT_LENGTH = 1200
const SEARCH_ENDPOINT = "https://api.tavily.com/search"

function safeHttpsUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === "https:" ? url.toString() : null
  } catch {
    return null
  }
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

  try {
    const response = await fetchImpl(SEARCH_ENDPOINT, {
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

    if (!response.ok) {
      const message =
        response.status === 429
          ? "The web search service rate limit was reached. Try again later."
          : response.status >= 500
            ? "The web search service is temporarily unavailable."
            : "The web search request was rejected. Check the Tavily API configuration."
      return { query: normalizedQuery, results: [], error: message }
    }

    const payload = await response.json()
    const rawResults = Array.isArray(payload?.results) ? payload.results : []
    const results = rawResults
      .slice(0, MAX_RESULTS)
      .map((item) => {
        const url = safeHttpsUrl(item?.url)
        if (!url) return null
        return {
          title: String(item?.title ?? new URL(url).hostname).slice(0, 240),
          url,
          content: String(item?.content ?? "").slice(0, MAX_CONTENT_LENGTH),
          ...(item?.published_date
            ? { publishedDate: String(item.published_date).slice(0, 80) }
            : {}),
        }
      })
      .filter(Boolean)

    return { query: normalizedQuery, results }
  } catch (error) {
    const aborted = error?.name === "AbortError" || error?.name === "TimeoutError"
    return {
      query: normalizedQuery,
      results: [],
      error: aborted
        ? "Web search timed out. Try again."
        : "Could not reach the web search service.",
    }
  }
}
