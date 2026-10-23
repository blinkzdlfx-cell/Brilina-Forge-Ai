import test from "node:test"
import assert from "node:assert/strict"

import { searchTavily } from "../lib/tavily-search.mjs"

test("rejects short queries before calling the API", async () => {
  let called = false
  const result = await searchTavily("x", {
    apiKey: "test-key",
    fetchImpl: async () => {
      called = true
      throw new Error("should not be called")
    },
  })
  assert.equal(called, false)
  assert.match(result.error, /between 2 and 400/)
})

test("returns a clear configuration error when Tavily key is missing", async () => {
  const result = await searchTavily("Cloudflare Workers", { apiKey: "" })
  assert.match(result.error, /TAVILY_API_KEY/)
  assert.equal(result.results.length, 0)
})

test("limits results, rejects non-HTTPS URLs, and truncates page content", async () => {
  const results = Array.from({ length: 7 }, (_, index) => ({
    title: `Page ${index}`,
    url: index === 1 ? "http://insecure.example/page" : `https://example.com/${index}`,
    content: "x".repeat(1500),
  }))
  let requestBody
  const result = await searchTavily("Cloudflare Workers", {
    apiKey: "test-key",
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body)
      return Response.json({ results })
    },
  })

  assert.equal(requestBody.max_results, 5)
  assert.equal(requestBody.api_key, "test-key")
  assert.equal(result.results.length, 5)
  assert.equal(result.results[0].content.length, 1200)
  assert.equal(result.results.some((item) => item.url.startsWith("http://")), false)
})

test("maps provider rate limits to a safe message", async () => {
  const result = await searchTavily("latest AI news", {
    apiKey: "test-key",
    fetchImpl: async () => new Response("limited", { status: 429 }),
  })
  assert.match(result.error, /rate limit/)
  assert.equal(result.results.length, 0)
})

test("does not expose provider response bodies on HTTP errors", async () => {
  const result = await searchTavily("latest AI news", {
    apiKey: "test-key",
    fetchImpl: async () => new Response("secret provider internals", { status: 500 }),
  })
  assert.match(result.error, /temporarily unavailable/)
  assert.equal(result.error.includes("secret provider internals"), false)
})


test("deduplicates URLs after removing fragments and common tracking parameters", async () => {
  const result = await searchTavily("same page", {
    apiKey: "test-key",
    fetchImpl: async () => Response.json({
      results: [
        { title: "First", url: "https://example.com/page?utm_source=one", content: "first" },
        { title: "Duplicate", url: "https://example.com/page?utm_source=two#section", content: "duplicate" },
        { title: "Second", url: "https://example.com/other", content: "second" },
      ],
    }),
  })
  assert.equal(result.results.length, 2)
  assert.equal(result.deduplicatedCount, 1)
  assert.equal(result.results[0].title, "First")
})

test("bounds successful provider response bodies", async () => {
  const result = await searchTavily("large response", {
    apiKey: "test-key",
    fetchImpl: async () => new Response("x".repeat(140 * 1024), { status: 200 }),
  })
  assert.match(result.error, /too large/)
  assert.equal(result.results.length, 0)
})

test("returns a safe error for malformed provider JSON", async () => {
  const result = await searchTavily("malformed response", {
    apiKey: "test-key",
    fetchImpl: async () => new Response("{not json", { status: 200 }),
  })
  assert.match(result.error, /invalid response/)
  assert.equal(result.results.length, 0)
})

test("retries one transient provider failure within the request budget", async () => {
  let attempts = 0
  const result = await searchTavily("retry search", {
    apiKey: "test-key",
    fetchImpl: async () => {
      attempts += 1
      if (attempts === 1) {
        return new Response("temporary", { status: 503, headers: { "retry-after": "0" } })
      }
      return Response.json({ results: [{ title: "Recovered", url: "https://example.com/recovered", content: "ok" }] })
    },
  })
  assert.equal(attempts, 2)
  assert.equal(result.results.length, 1)
  assert.equal(result.results[0].title, "Recovered")
})

test("does not retry when Retry-After exceeds the remaining request budget", async () => {
  let attempts = 0
  const result = await searchTavily("rate limited search", {
    apiKey: "test-key",
    timeoutMs: 100,
    fetchImpl: async () => {
      attempts += 1
      return new Response("limited", { status: 429, headers: { "retry-after": "5" } })
    },
  })
  assert.equal(attempts, 1)
  assert.match(result.error, /rate limit/)
})

test("marks partial results when malformed source URLs are dropped", async () => {
  const result = await searchTavily("partial search", {
    apiKey: "test-key",
    fetchImpl: async () => Response.json({
      results: [
        { title: "Good", url: "https://example.com/good", content: "kept" },
        { title: "Bad", url: "javascript:alert(1)", content: "dropped" },
      ],
    }),
  })
  assert.equal(result.results.length, 1)
  assert.equal(result.partial, true)
  assert.match(result.error, /omitted/)
})

test("reports cancellation without exposing provider errors", async () => {
  const controller = new AbortController()
  controller.abort()
  const result = await searchTavily("cancel search", {
    apiKey: "test-key",
    signal: controller.signal,
    fetchImpl: async (_url, options) => {
      throw options.signal.reason
    },
  })
  assert.match(result.error, /cancelled/)
  assert.equal(result.results.length, 0)
})


test("caps combined excerpt content at 4000 characters and marks the result partial", async () => {
  const result = await searchTavily("aggregate excerpt budget", {
    apiKey: "test-key",
    fetchImpl: async () => Response.json({
      results: Array.from({ length: 5 }, (_, index) => ({
        title: `Page ${index}`,
        url: `https://example.com/aggregate-${index}`,
        content: "x".repeat(1200),
      })),
    }),
  })

  assert.equal(result.results.length, 5)
  assert.equal(result.results.reduce((total, item) => total + item.content.length, 0), 4000)
  assert.deepEqual(result.results.map((item) => item.content.length), [1200, 1200, 1200, 400, 0])
  assert.equal(result.partial, true)
  assert.match(result.error, /truncated or omitted/)
})

test("marks results partial when an individual excerpt exceeds the per-result cap", async () => {
  const result = await searchTavily("individual excerpt budget", {
    apiKey: "test-key",
    fetchImpl: async () => Response.json({
      results: [{
        title: "Long page",
        url: "https://example.com/long",
        content: "x".repeat(1201),
      }],
    }),
  })

  assert.equal(result.results[0].content.length, 1200)
  assert.equal(result.partial, true)
})
