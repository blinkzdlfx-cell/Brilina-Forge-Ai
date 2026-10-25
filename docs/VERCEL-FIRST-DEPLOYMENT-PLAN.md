# Vercel-First Runtime Audit and Deployment Plan

Status: planning only. No application code, production secrets, production database, or live deployment is changed by this document.

## Objective

Make Vercel the candidate primary runtime for Brilina Forge AI while retaining Cloudflare services that provide useful AI, edge, and background-processing capabilities. Preserve current product features and Supabase data. Keep the existing Cloudflare deployment available until a Vercel deployment passes compatibility and functional tests.

This document records an initial source/configuration review. It is not proof that a Vercel build or deployment has succeeded.

## Intended architecture

- **Vercel:** primary Next.js 16 / React 19 application runtime, pending compatibility validation and confirmation that the chosen plan's terms fit the intended use.
- **Cloudflare Workers AI:** continue calling model inference over its API for supported text, vision, and speech tasks. The application must not depend on a Cloudflare-only runtime binding to make those API calls.
- **Cloudflare Queues / Workflows:** optional coordination for asynchronous tasks after a separate design and cost/limit review. Use these for durable task orchestration, retries, and status tracking—not as an assumption that arbitrary CPU-heavy work becomes unlimited.
- **Supabase:** retain Auth, PostgreSQL, and private Storage. Do not migrate or alter production data as part of the runtime compatibility phase.
- **Tavily and existing external providers:** retain unless a separate evidence-based decision is made.
- **GitHub:** source of truth, CI checks, pull requests, and automatic deployment triggers.

## Initial findings

### 1. Cloudflare-specific runtime coupling

The repository includes `lib/runtime-env.ts`, which imports `getCloudflareContext()` from `@opennextjs/cloudflare`. Cloudflare configuration also exists in `open-next.config.ts`, `wrangler.jsonc`, and `next.config.ts`.

The environment helper's `process.env` fallback is a useful start, but Vercel does not provide Cloudflare's request context or Worker bindings. Audit all imports and calls to Cloudflare runtime APIs. Keep Cloudflare deployment files intact; do not delete or replace them just to add Vercel support.

**Acceptance:** application server code reads configuration through a platform-neutral server-only helper; no Vercel request path requires `getCloudflareContext()` or an AI binding. Vercel build passes while the existing Cloudflare configuration remains usable.

### 2. Chat and file payload sizes

Current source declares a 5 MiB chat request limit, a 10 MiB file-upload limit, and a 20 MiB audio limit. Vercel Functions document a 4.5 MB request/response payload limit. A request can be rejected by the platform before the route's own validation runs.

**Direction:** avoid proxying large binaries through Vercel Functions. Prefer private Supabase Storage uploads with authenticated, short-lived references/URLs, then process the stored object from a trusted server-side path. Confirm provider/API URL-input support before implementation. Do not assume Cloudflare Workers AI accepts every Supabase signed URL or that moving base64 conversion to a Worker avoids the Worker CPU limit.

**Acceptance:** file and audio flows have a documented, secure path that preserves ownership checks, private storage, allowed file types, size limits, and cleanup behavior without sending large payloads through Vercel routes unnecessarily.

### 3. Chat execution duration and streaming

The chat route currently declares `maxDuration = 30`. Vercel's current Fluid Compute documentation lists up to 300 seconds for Hobby and up to 800 seconds for Pro/Enterprise, subject to plan and configuration. The selected Vercel plan's rules and limits must be verified before relying on them.

Do not set every route to five minutes by default. Use a route-specific duration budget, cancellation handling, bounded tool steps, and streaming tests. Long-running work should become a durable job with progress/status rather than holding an HTTP request open indefinitely.

**Acceptance:** streaming works on Vercel, normal chat and tool use complete within their configured budget, and requests that exceed it fail predictably without duplicate side effects.

### 4. CI and deployment build

The existing CI validates the project and includes Cloudflare/Docker-related build steps, but Vercel-specific build compatibility has not been established.

**Direction:** add Vercel build verification to CI after determining the correct project/build command. Retain current checks. Do not add deployment secrets to source control.

**Acceptance:** CI checks the proposed Vercel build and current checks before changes are merged.

## Cost-conscious model and task strategy

1. Continue using Cloudflare Workers AI where a model fits the task and the free allowance is available.
2. Monitor usage by model/task. Cloudflare's published Workers AI free allocation is 10,000 Neurons per day; usage beyond the free allocation requires a paid Workers plan, and some models require paid access. Treat quota exhaustion as a provider-limit condition, not a Vercel runtime error.
3. Batch related work when it genuinely reduces repeated prompts, provider calls, or orchestration overhead. Batching does **not** make tokens or inference free, and excessively large batches increase latency, context use, failure impact, and retry cost.
4. Keep interactive chat responses bounded. Use small, independently retryable background steps for work that can continue after the user receives an acknowledgement.
5. Persist job status and checkpoints in an appropriate existing data store; use idempotency keys so retries do not duplicate messages, file writes, or provider actions.
6. Queue only compact task metadata and storage references, not large files or secrets.
7. Keep a user-visible path for progress, cancellation where supported, and clear failure/retry messages.
8. Before enabling Queues or Workflows, check current free quotas, CPU limits, step/operation charges, retention, and required billing setup. Cloudflare free background orchestration still has limits; it is not a general-purpose unlimited CPU runtime.

## Automatic deployments

Vercel supports Git integration with GitHub. Once the repository is connected and the production branch is set to `main`, pushes/merges to `main` can trigger production deployments; other branches and pull requests can receive preview deployments. This is the equivalent workflow to the existing push-to-main Cloudflare deployment pattern.

Recommended release flow:

1. Create a short-lived feature/documentation branch.
2. Push changes and open a pull request.
3. CI runs tests, lint/type checks, and relevant build checks.
4. Review the preview deployment and test it.
5. Merge into `main`.
6. Vercel automatically builds and deploys production.
7. Verify health and core workflows; roll back to a known-good deployment if needed.

The GitHub-to-Vercel connection, production branch, environment variables, and deployment status checks must be configured in the Vercel dashboard. This document does not create or connect a Vercel project.

## Compatibility work plan (small batches)

### Batch 1 — Documentation and inventory
- Record runtime architecture, current platform-specific dependencies, payload conflicts, and the target acceptance criteria.
- No runtime code changes and no production changes.

### Batch 2 — Environment portability
- Inspect and refactor the server-only environment helper.
- Ensure public and server-only variables are separated.
- Preserve Cloudflare compatibility and avoid exposing secrets.

### Batch 3 — Vercel build compatibility
- Resolve framework/build assumptions.
- Add a Vercel build check to CI.
- Verify existing Cloudflare build checks remain intact.

### Batch 4 — Request and file handling
- Design the private-storage reference flow for images, documents, and audio.
- Confirm provider URL-input support and preserve authentication/RLS.
- Implement only after the design is reviewed.

### Batch 5 — Runtime and streaming tests
- Test chat, tool calls, model APIs, authentication, storage, transcription, diagnostics, and conversation persistence on a preview deployment.
- Check logs and function duration/payload behavior.

### Batch 6 — Optional background orchestration
- Add Queues or Workflows only for a specific demonstrated need.
- Define payload schema, retries, idempotency, progress, cancellation, retention, limits, and cost controls first.

### Batch 7 — Cutover decision
- Compare real test results and usage against the current Cloudflare deployment.
- Switch production only after acceptance criteria pass.
- Keep a rollback path until stable.

## Explicit non-goals for this phase

- No feature removal or product redesign.
- No production database migrations or data changes.
- No Azure or InterServer deployment work.
- No disabling the current Cloudflare deployment.
- No assumption that a free plan is unlimited or suitable for commercial use without checking its terms.
- No addition of a third hosting platform unless testing demonstrates a clear need.

## Release acceptance checklist

- [ ] Vercel build passes in CI.
- [ ] Existing Cloudflare build/deployment path remains intact.
- [ ] Environment secrets are server-only and configured outside Git.
- [ ] Auth and authorization work on preview.
- [ ] Chat streaming and cancellation work.
- [ ] Cloudflare Workers AI text generation works through the API.
- [ ] Tavily search works with bounded results and safe error handling.
- [ ] Image/document flows work without oversize proxy payloads.
- [ ] Voice transcription works within chosen provider and platform limits.
- [ ] Conversations and private attachments persist correctly in Supabase.
- [ ] Diagnostics do not log prompts, secrets, transcripts, or raw provider payloads.
- [ ] Function duration, memory, payload sizes, and provider quotas are measured.
- [ ] Production cutover and rollback steps are documented.
