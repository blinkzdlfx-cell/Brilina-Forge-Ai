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
- Recovery docs: in progress.
- Batch 1: source audit done; regression tests/verification pending.
- Batch 2: not started.
- Batch 3 (Tavily): intentionally held until last.
- Production deployment: not performed.
