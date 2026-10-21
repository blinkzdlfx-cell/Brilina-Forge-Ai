# AI Pipeline Implementation — Three Batches

**Correct repository:** `blinkzdlfx-cell/Brilina-Forge-Ai`  
**Execution order:** Batch 1 → verify/gate → Batch 2 → verify/gate → Batch 3 (Tavily last).  
**Production:** No production deployment is authorized by this plan.

## Batch 1 — Native streaming and stream-contract verification
Audit and preserve the existing AI SDK streaming path (`streamText` → `toUIMessageStream` → `createUIMessageStreamResponse` → frontend `useChat`). Verify text is forwarded incrementally, tool calls/results remain ordered and validated, sources/reasoning metadata remain intact, and abort/error outcomes are correct. Add tests that fit the actual Next.js/AI SDK architecture; do not transplant custom streaming code from the other repository. Fix only gaps demonstrated by tests or source evidence.

**Gate:** focused tests, all existing tests, lint, typecheck, and Cloudflare Worker build pass. Document what was already correct, what changed, and any live-provider/browser tests not performed.

## Batch 2 — Context processing, reliability, observability, and image intelligence
Combines original stages 2, 3, and 5; Tavily-specific implementation is excluded.

- **Context:** bound actual request bytes (not just Content-Length), conversation history/parts, tool outputs, and downstream context. Preserve recent/critical content, head and tail when truncating, ordering and provenance. Deduplicate only with defensible keys. Keep partial/truncated markers.
- **Reliability:** audit timeout/abort/error handling, safe retries, model/tool-turn budgets, concurrency only where real fan-out exists, and partial failure behavior. Avoid retries that duplicate side effects.
- **Observability:** structured redacted measurements for stages, elapsed time, payload sizes, outcomes, and provider/model; distinguish Worker CPU from elapsed/provider time. Never log user content/secrets.
- **Image intelligence:** first inspect current composer/message schemas and image input path. Verify current provider/model availability, request formats, image limits, size limits, and quotas from official docs. Implement image handling only through confirmed interfaces. Preserve image indices/provenance and partial failures. Do not invent two Groq models or quotas; add Cloudflare/Groq routing only when supported by verified configuration and architecture.

**Gate:** tests for bounds, provenance, dedupe, partial failures, retries, aborts, redaction, and image validation pass; full CI checks pass; Tavily behavior remains unchanged.

## Batch 3 — Tavily integration (last)
Trace the existing working `TAVILY_API_KEY` → `tools/web_search.ts` → `lib/tavily-search.mjs` path. Add regression tests and improve bounds, normalization, deduplication, source provenance, error classification, and partial-result behavior without replacing or duplicating Tavily.

**Gate:** successful search, timeout, 429, 5xx, malformed/oversized response, deduplication, and HTTPS source URL tests pass. Full CI checks pass.

## Cross-batch rules
- Work on branch `recovery/ai-pipeline-batches` until review; do not commit directly to production `main`.
- Before each batch, re-read current HEAD and source; preserve unrelated changes.
- Complete and verify one batch before beginning the next. Never skip a requirement; if a requirement cannot be implemented safely, record the blocker and evidence.
- No production deployment, secrets, new Workers, dependencies, or schema changes without explicit authorization.
- Record changed files, commit SHA, CI evidence, and what remains unverified.
