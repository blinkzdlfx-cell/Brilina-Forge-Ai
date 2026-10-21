# AI Pipeline Requirements

**Repository:** `blinkzdlfx-cell/Brilina-Forge-Ai`  
**Baseline:** `main` at `3609467a88839152f4a95ec31be71693920d5578`  
**Status:** Recovered requirements; adapted to this repository's Next.js + AI SDK + OpenNext Cloudflare Worker architecture. This document is not proof of implementation.

## Goal

Deliver a bounded, observable, streaming-first AI pipeline while preserving the existing chat UI, Cloudflare Workers AI model, working Tavily search, GitHub repository tool, ask-user tool, voice transcription, and deployment configuration.

## Mandatory requirements

### R1. Native end-to-end streaming
Keep provider generation connected to the AI SDK's streaming response and the existing `useChat` frontend. Do not buffer a completed answer and split it into artificial chunks. Preserve event order, tool-call/input validation, tool outputs, sources, reasoning metadata, errors, request identity, and abort/cancellation. Keep the current non-streaming fallback only if a real provider requires it. This repository currently uses `streamText` and `toUIMessageStream`; audit and test this path before replacing anything.

**Acceptance:** prove the response uses a stream; text can be observed before generation completes; chunks and tool events retain order; provider failure/cancellation is not reported as success; malformed/partial tool input is never executed.

### R2. Bounded chunking
Chunk oversized tool, search, document, and image inputs at semantic boundaries where possible. Define limits per stage for request bytes, message count/parts, characters or tokens, item count, image count/size, and total work. Preserve source IDs, URLs, paths, page/section, and image index. Never silently discard everything after a prefix; report truncation/partial status. Use bounded concurrency.

### R3. Filtering and deduplication
Deduplicate only where stable identifiers or normalized source URLs/content make duplicates defensible. Filter obvious irrelevant/repeated material before model context without speculative scoring that could discard necessary evidence. Keep provenance and counter-evidence; retain original source access for verification. Do not summarize away source evidence required for consequential changes.

### R4. Bounded buffering and cancellation
Avoid holding a complete generated answer before forwarding it. Bound protocol frames and upstream payloads; retain only required partial frames/tool-call fragments/context. Validate completed tool arguments. On abort/disconnect/error, cancel upstream work and release readers/resources where the API allows it. Persist final output only where persistence exists; do not add a database just for token-by-token writes.

### R5. Batch analysis inputs
Batch related search passages, documents, or images only within verified provider limits. Keep source identity/order, uncertainty, and partial-failure markers in combined results. Avoid redundant multi-provider inference without a reason. Batching must not delay ordinary interactive text streaming unnecessarily.

### R6. Bound total work and concurrency
Set explicit limits for model/tool turns, provider requests, concurrent batches, request/payload size, and elapsed time where relevant. Respect provider quotas and Retry-After. Avoid retry storms and unbounded fan-out. Do not assume extra Workers multiply account-level quotas.

### R7. Safe recovery
Classify timeout, abort, 429, 5xx, authentication/configuration, validation, malformed response, and permanent failures. Use bounded backoff/jitter only for safe-to-repeat operations and respect Retry-After. Do not retry side-effecting tool operations unless idempotency is established. Preserve successful partial batch results and clearly mark incomplete work. Do not claim full success after partial failure.

### R8. Redacted observability
Use structured stage diagnostics for request/correlation ID, stage, provider/model, attempt, outcome, duration, payload sizes, batch counts, and available usage metadata. Separate Worker CPU time (when the runtime exposes it) from wall-clock duration and provider latency. Measure validation/context preparation, tools/search/vision, model generation, and response delivery when possible. Never log prompts, message bodies, API keys, authorization headers, audio, or raw provider payloads. Do not diagnose CPU exhaustion without runtime evidence.

### R9. Context and provenance integrity
Preserve original user intent, relevant conversation history, tool-call/result pairing, source provenance, and the exact task context through chunking, batching, summaries, retries, and partial failures. Keep the selected model and request identity consistent. If repository/branch snapshots are added later, make them immutable per run. Mark omitted, truncated, failed, or uncertain input explicitly.

## Existing integration constraints

- **Tavily is already working.** Its request/configuration/runtime path must remain unchanged in Batches 1 and 2. Batch 3 audits and hardens the existing integration; it must not add a duplicate search provider or replace Tavily.
- Current chat model is Cloudflare Workers AI `@cf/zai-org/glm-4.7-flash` through the OpenAI-compatible endpoint.
- Current app uses Next.js 16, React 19, AI SDK v7, `streamText`, `toUIMessageStream`, `useChat`, and OpenNext Cloudflare.
- Current chat route has a 48 KiB declared request-size limit, keeps six recent messages, caps parts at 24/message, caps model output at 4096 tokens and tool steps at four, and already emits redacted stage diagnostics. Verify these constraints against actual body bytes and runtime behavior before treating them as complete.
- Current image attachment path and Groq vision configuration have not yet been verified. Do not invent provider keys, models, or limits. Image work belongs in Batch 2 after a source/UI/API audit and authoritative model-contract verification.
- No new Worker, dependency, database schema, secret, or production deployment without evidence and authorization.

## Required test categories

Streaming order and early delivery; malformed/partial tool calls; body and history bounds; oversized result truncation with head/tail/provenance; deduplication; batch ordering and partial failure; concurrency; abort/timeout; safe retry classification; 429/5xx; redaction; image size/count/provider failures; Tavily success/error/oversized payload/source URL regression; existing unit tests, lint, typecheck, and Cloudflare Worker build.
