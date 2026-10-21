# AI Pipeline Recovery Status

## Repository correction

The prior AI pipeline plan and implementation were accidentally committed to `blinkzdlfx-cell/brilina-forge`. That repository is not the correct application. The correct repository is `blinkzdlfx-cell/Brilina-Forge-Ai`, a Next.js 16 + AI SDK v7 + OpenNext Cloudflare Worker app. Do not copy source files mechanically between these repositories.

## Source audit at recovery start

Correct repository `main` was at `3609467a88839152f4a95ec31be71693920d5578` (2026-10-21).

- `app/api/chat/route.ts` already uses `streamText`, `toUIMessageStream`, `createUIMessageStreamResponse`, request abort signal, and a maximum of four tool steps. It has a declared 48 KiB request bound, six-message history selection, 24 parts/message, 4096 output-token limit, and redacted stage diagnostics. These are existing controls to validate, not evidence every requirement is satisfied.
- `components/chat.tsx` uses AI SDK `useChat`, forwards model choice, and calls `stop()` for a new chat while a request is active.
- `tools/web_search.ts` calls the existing `lib/tavily-search.mjs`; preserve it untouched through Batches 1 and 2.
- `tools/github_repo.ts` and `tools/ask_user.ts` are existing tools; preserve their contract.
- Existing automated tests cover Tavily only. There is no route/stream contract suite visible in `tests/` at audit start.
- Current model configuration only exposes Cloudflare Workers AI `@cf/zai-org/glm-4.7-flash`. No image attachment path or Groq vision configuration has been confirmed.
- `wrangler.jsonc` has the Workers AI binding and observability enabled. Do not change deployment configuration for this work.

## Batch 1 checkpoint

The existing architecture is already streaming-first at source level. Batch 1 must add useful regression coverage and fix only demonstrated defects, rather than reimplement streaming. No live provider or browser test is claimed unless separately performed.

## Wrong-repository changes not to transplant blindly

The other repository's Batch 1 used custom provider/controller/Worker streaming layers absent here. Its Batch 2 included head/tail tool-result truncation and retry wrappers, but those APIs do not match this application's AI SDK route and tools. Reimplement the requirements at the correct integration points and retain only applicable ideas.

## Status
- Recovery docs: recovered and adapted in `docs/AI_PIPELINE_REQUIREMENTS.md` and `docs/AI_PIPELINE_BATCH_PLAN.md`.
- Batch 1: existing native streaming path preserved; added first-text-chunk, normal completion (finish reason and usage), and abort lifecycle diagnostics in `app/api/chat/route.ts`. Added `tests/chat-streaming-contract.test.mjs`. CI run `39687303526` passed unit tests (9 total), lint, typecheck, and Cloudflare Worker build. The first typecheck correctly caught an AI SDK event-type mismatch; it was fixed from `text` to `text-delta` and the final run passed. Live-provider/browser acceptance was not performed.
- Batch 2: implemented bounded streamed request-body parsing (5 MiB app limit), six-message/32,000-character context budget, per-message/part bounds, PNG/JPEG/WebP image validation (1 MiB/image, 3 MiB total), provider-aware vision routing, image upload/preview/removal, safe retry/timeouts, and redacted lifecycle diagnostics. CI on commit `5bf86bfbd80ec826147b4e3d885118965955ba61` passed tests, lint, typecheck, and Cloudflare build. A subsequent diagnostic-redaction change is awaiting CI. No live-provider/browser test yet.
- Batch 3 (Tavily): intentionally held until last; no Tavily source/config was changed.
- Production deployment: not performed.
