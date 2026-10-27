# Brilina Forge AI — Consolidated Architecture and Four-Batch Execution Plan

**Repository:** `blinkzdlfx-cell/Brilina-Forge-Ai`  
**Production application:** Vercel — `https://brilina-forge-ai.vercel.app`  
**Custom domain target:** `https://forge.brilinadev.name.ng`  
**Retained fallback:** Cloudflare Worker `brilina-forge-ai` — `https://brilina-forge-ai.blinkzdlfx.workers.dev`  
**Supabase project:** `jjocynbtuafdokkjemym`  
**Plan status:** Execution roadmap; no production deployment, DNS changes, secret changes, or live database migrations are authorized by this document.

This document is the controlling execution plan. `docs/IMPLEMENTATION_SPEC.md` remains the product requirements catalogue. `docs/VERCEL-FIRST-DEPLOYMENT-PLAN.md` provides the Vercel-specific deployment notes; its earlier seven-step compatibility outline is superseded by the four substantial batches below. The AI pipeline requirements remain authoritative for streaming, bounds, provenance, cancellation, retries, and redacted diagnostics.

## 1. Architecture decision

Vercel is the primary production application runtime. The existing Cloudflare Worker deployment remains available as a fallback until the Vercel application and its required workflows are verified. Do not route ordinary Vercel application requests through the old Worker unless a specific, documented Cloudflare service is intentionally being called.

- **Vercel Hobby:** Next.js 16 / React 19 application and server routes. Respect the current plan's execution, request/response, memory, usage, and acceptable-use restrictions. The Vercel-native `pnpm build` is a required CI check; the OpenNext Worker build remains a separate compatibility check.
- **Cloudflare Workers AI:** keep existing model calls over the Cloudflare API where configured and useful. The Vercel app must not depend on Cloudflare-only request bindings to call these APIs.
- **Cloudflare DNS/edge services:** retain where currently configured and useful. Do not change production DNS as part of implementation batches.
- **Supabase:** retain Auth, PostgreSQL, and private Storage. Never reset or reapply production migrations to “make sure.” Inspect migration history and live schema read-only before proposing a production change.
- **Tavily:** preserve the working integration and its current request/result bounds. DuckDuckGo may be evaluated as an additional source only after verifying the exact official API capability and terms; do not replace Tavily or add an unofficial scraper by assumption.
- **Vision/documents:** retain configured Groq/Cloudflare vision and Gemini PDF extraction where valid. Keep provider credentials server-side and verify provider limits before changing model IDs or file limits.
- **Voice:** retain the current authenticated Cloudflare Workers AI Whisper API flow and ten-minute recording-session limit. Improve reliability without replacing the provider by default.
- **Email:** inspect current live configuration before any Resend migration. Existing password-recovery behavior is accepted; do not redesign it without a reproducible defect.
- **No image generation. No GitHub integration in this scope.** Do not add a new database, cache, queue, workflow engine, hosting platform, or dependency unless a measured need and the applicable approval gate justify it.

Official Vercel documentation currently describes a 4.5 MB request/response payload limit for Functions and plan-dependent duration/usage limits. The repository has server upload routes with 10 MiB file and 20 MiB audio limits, so those application-level limits do not guarantee that Vercel will accept those uploads. Move large upload bytes directly to private Supabase Storage through an authenticated upload flow, or use a smaller request path; do not rely on oversized uploads passing through a Vercel Function. Confirm the current Vercel plan settings and actual deployed behavior before treating any duration allowance as guaranteed.

## 2. Evidence-based current-state audit

Repository inspection of `main` at `87f117c674c0c805177eb248724e92c81a594844` established:

- `lib/tavily-search.mjs` already has bounded results, excerpt and aggregate context caps, response-body limits, URL normalization/deduplication, bounded retry handling, and safe errors.
- `app/api/chat/route.ts` uses AI SDK streaming (`streamText` / UI message stream conversion), authenticates users, and applies request/context/tool bounds. It declares `maxDuration = 30`.
- `app/api/transcribe/route.ts` authenticates users, validates a server-created recording session, enforces a ten-minute session cap and 20 MiB audio cap, and calls Cloudflare Workers AI over its API.
- `lib/runtime-env.ts` imports `getCloudflareContext()` with a `process.env` fallback. This is a portability touchpoint to verify, not proof that the entire app needs rewriting.
- Conversation lifecycle, idempotent message saves, private file APIs, upload-first attachment references, and TXT/Markdown/CSV/JSON/HTML/PDF/DOCX plus image processing were merged in PR #30. Audit these against current source and tests; do not rebuild them by default.
- Supabase migrations `0001` through `0006` exist in the repository. Their presence does not prove that all migrations are applied to the live project or that current live RLS/storage policies are correct.
- The GitHub Vercel status check for the current `main` commit reports success. That is deployment-check evidence, not a substitute for authenticated live workflow tests.
- The current CI runs unit tests, lint, typecheck, the Cloudflare Worker build, and a Docker build. It did not explicitly run `pnpm build` as a named native Next.js/Vercel check; Batch 1 adds that independent check.
- README and implementation-spec sections still contain older Cloudflare-primary assumptions and need reconciliation with this decision.
- Current upload and audio routes proxy binary bodies through the application server. Their 10 MiB and 20 MiB application limits conflict with the documented Vercel Function payload limit; this is a concrete reliability gap.
- Password recovery, MFA/AAL2, owner account creation, and the previous accepted auth tests are preserved. Do not repeat or redesign them without evidence of a regression.

Status reporting must distinguish **source present**, **automated test present/passing**, **Vercel/preview verified**, **live provider verified**, and **unknown**. CI, a deployment status check, source code, and a live acceptance test are different forms of evidence.

## 3. Four substantial implementation batches

No extra implementation batches are to be inserted between these four. Related work belongs in the appropriate batch and is completed as a coherent unit. Work may be ordered internally for safety, but it is not reported as a separate batch.

### Batch 1 — Vercel runtime foundation, portability, streaming and verification

Scope:
- Reconcile runtime assumptions with Vercel as primary and Cloudflare as a retained service/fallback.
- Inspect all Cloudflare-specific runtime imports/bindings and keep environment secrets server-only; preserve compatibility for the retained Worker.
- Add an explicit native Next.js production build to CI while retaining tests, lint, typecheck, Cloudflare Worker build, and container build.
- Test native AI SDK streaming, ordered tool events, cancellation, partial/error outcomes, and bounded response delivery. Preserve native streaming; never buffer the complete answer and simulate chunks.
- Improve only demonstrated runtime/error/diagnostic gaps. Preserve auth, owner/AAL2, user isolation, existing UI, and accepted password recovery.
- Update README, this roadmap, the implementation specification, and relevant setup notes so deployment instructions match Vercel and do not describe the Worker as the production application runtime.

Acceptance:
- Unit/contract tests, lint, typecheck, native `pnpm build`, retained Cloudflare build, and container build pass.
- Vercel preview can load the app, authenticate, and stream a response before generation finishes.
- Tool order, abort/error states, request IDs, and safe diagnostics behave as expected.
- The retained Cloudflare deployment configuration remains intact.
- Any live test not performed is explicitly listed as unknown; no production cutover is implied.

### Batch 2 — Conversation reliability, persistence, and private upload flows

Scope:
- Upload implementation underway on `feat/conversation-storage-batch-2`: authenticated signed-upload URL endpoints now send image/document bytes directly to private Supabase Storage; completion verifies the current user's storage path, declared size, and supported file signatures before creating metadata.
- Audio recording is being moved to a dedicated private 20 MiB Supabase Storage bucket. The browser uploads the completed recording directly and submits only its owner/session-scoped storage reference to the transcription route; the existing ten-minute session cap and retry reservation remain enforced.
- Audit the merged conversation APIs, message persistence, pin/archive/rename/delete lifecycle, idempotency, sequence allocation, and interrupted/failed assistant states.
- Verify save/retry behavior cannot duplicate user turns or assistant messages, and that a refresh/reopen restores the correct conversation and context.
- Fix the Vercel request-size conflict for file and audio uploads. Prefer authenticated direct-to-private-Supabase-Storage upload with server-verified ownership and metadata, then send compact file references to application routes. Never put base64 file data in chat messages.
- Preserve MIME/signature validation, per-user storage paths, short-lived signed URLs, deletion/cleanup, size limits, and private bucket policies.
- Inspect migrations `0001`–`0006` and live migration state read-only. Do not apply or alter production migrations without separate explicit approval.
- Exercise network loss, duplicate submission, partial persistence, oversized payload, unauthorized file access, and cleanup failures using custom test scripts where useful.

Acceptance:
- Existing and new automated tests pass; relevant API workflows are tested on a Vercel preview with a real authorized account.
- Large file/audio bytes no longer rely on exceeding Vercel Function request limits.
- Conversation history and file access remain user-isolated.
- Production schema, data, secrets, and DNS remain unchanged unless separately approved.

### Batch 3 — Provider workflows: search, transcription, vision and documents

Scope:
- Preserve Tavily as the primary existing search integration and its current behavior/guardrails. Add regression coverage for timeout, cancellation, 429, 5xx, malformed/oversized payloads, partial results, deduplication, and source provenance.
- Evaluate DuckDuckGo as an optional additive search source only after verifying the official API's actual search capability, response quality, rate limits, terms, and reliability. Do not replace Tavily, introduce an unofficial scraping dependency, or silently switch providers. If the available API is only an Instant Answer endpoint, document that limitation and do not misrepresent it as full web search.
- Harden the existing ten-minute Whisper transcription flow: upload/session validation, timeouts, bounded retry, provider failures, request cancellation, useful user errors, and redacted diagnostics. Preserve authentication and session attempt limits.
- Verify image processing and PDF/TXT/Markdown/CSV/JSON/HTML/DOCX extraction against the current provider contracts. Keep private-file ownership checks before any provider can access content; keep outputs and source references bounded.
- Inspect current Resend/email settings and verify a live reset/delivery flow before any provider migration. Preserve accepted MFA/AAL2 recovery behavior.
- Add temporary test scripts for full route workflows using mocks and, where credentials are safely available, preview tests. Never print secrets or private file contents.

Acceptance:
- Tavily tests and any accepted additive search-provider tests pass; Tavily remains usable when the optional provider is absent or fails.
- Voice failures recover safely without duplicate transcription attempts or false success.
- Image/document workflows respect provider limits, private file ownership, timeouts, and partial-failure reporting.
- Live provider tests are clearly separated from mocked/unit/contract tests.

### Batch 4 — Agent Workflow System and full application acceptance

Scope:
- Implement the documented Agent Workflow System only after runtime, persistence, and file/provider boundaries are stable.
- Choose one durable execution mechanism after verifying current Vercel and retained Cloudflare capabilities and limits. Do not introduce a queue/workflow engine merely because it was mentioned as an option.
- Provide authoritative run state, ordered stage events, progress/reconnect recovery, duplicate-submit protection, idempotent retries, cancellation, timeout/failure handling, cleanup/retention, and user-scoped access controls.
- Store large artifacts and file payloads by private storage reference; do not put them in queue messages or realtime events.
- Preserve the existing user interface and integrate workflow controls without redesigning unrelated areas.
- Add the owner-managed invited-user quota design only if it is explicitly included in the documented acceptance scope and the implementation can enforce concurrency-safe limits. The current `docs/architecture/INVITED_USER_LIMITS.md` is design-only and does not authorize quota tables or enforcement by itself.
- Run the complete regression/acceptance matrix across authentication, MFA/AAL2, authorization/revocation, RLS, streaming, tool calls, Tavily/optional search, vision/documents, voice, persistence, upload/download/delete, diagnostics, provider quota/timeouts, workflow recovery, and rollback.

Acceptance:
- All automated checks and workflow tests pass.
- Preview testing confirms real end-to-end workflows with authorized accounts and configured providers.
- Each requirement has evidence and a status; no untested feature is described as verified.
- Production deployment, database migration, secret, and DNS changes remain separate explicit actions.

## 4. Security and reliability invariants

- Server-verified Supabase session and fresh disabled-user/access-state checks for protected APIs.
- Owner-only admin access and server-verified AAL2; never trust client-editable role metadata.
- Provider secrets and Supabase service-role key remain server-side.
- Validate body size from actual bytes, file type/signature, schemas, counts, and model/tool permissions.
- Bound elapsed time, provider calls, output, concurrency, retries, and memory-heavy transformations.
- Respect provider 429/Retry-After and avoid retrying side-effecting operations without idempotency.
- Preserve native streaming; use bounded buffering only for incomplete protocol frames/necessary state, never to delay the whole response.
- Preserve user data isolation across database, storage, caches, jobs, and realtime channels.
- Keep diagnostics redacted; never log prompts, messages, transcripts, audio, credentials, cookies, raw provider payloads, or private file contents.
- Application diagnostic rows are not native Cloudflare logs; clearing one must not be described as clearing the other.
- Do not claim complete success when only partial results were produced.

## 5. Execution and reporting rules

For each of the four batches, record baseline/target commit SHAs, changed files, reason for each change, exact test commands and results, CI status, preview/live tests actually performed, deployment status, known gaps, and rollback instructions.

Use custom temporary test scripts where source-level tests are insufficient. Prefer tests that exercise route logic and observable behavior over tests that only assert that a string exists. Run the complete relevant verification suite before advancing. If a test cannot be run because live credentials, browser access, or an authorized account are unavailable, report the blocker rather than claiming success.

Never deploy to production, change DNS, alter production secrets, apply live Supabase migrations, or provision paid infrastructure without separate explicit approval.

## 6. Documentation authority

- `docs/NEXT_PHASE_PLAN.md`: controlling four-batch execution and acceptance roadmap.
- `docs/VERCEL-FIRST-DEPLOYMENT-PLAN.md`: Vercel deployment/runtime details; align it to this roadmap.
- `docs/IMPLEMENTATION_SPEC.md`: product requirements; reconcile obsolete hosting assumptions with this plan.
- `docs/AI_PIPELINE_REQUIREMENTS.md`: streaming, bounds, provenance, retries, cancellation, and diagnostics requirements.
- `docs/AI_PIPELINE_BATCH_PLAN.md` and `docs/AI_PIPELINE_RECOVERY_STATUS.md`: historical pipeline notes, not current completion trackers.
- `docs/SECURE-APPLICATION-DIAGNOSTICS.md`: application diagnostic access and native Cloudflare log limitations.
- `docs/architecture/INVITED_USER_LIMITS.md`: future design only unless explicitly approved as implementation scope.

When documents conflict, preserve the user's current approved architecture and verify source before changing code. Update the owning document rather than creating competing plans.
