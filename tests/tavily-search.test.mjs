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
  assert.equal(result.results.length, 4)
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
