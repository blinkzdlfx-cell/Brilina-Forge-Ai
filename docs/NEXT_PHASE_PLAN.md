# Brilina Forge AI — Consolidated Next-Phase Plan

**Status:** Planning document only. No external service, queue, new migration, or workflow implementation is authorized by this document.
**Repository:** `blinkzdlfx-cell/Brilina-Forge-Ai`
**Current baseline reviewed:** `main` at `ee35aaef5dae79d4ab7fb695b9f3f1e133f47ea5` (2026-10-24)
**Production target:** Cloudflare Worker `brilina-forge-ai`
**Production URL:** `https://brilina-forge-ai.blinkzdlfx.workers.dev`
**Supabase project:** `jjocynbtuafdokkjemym`
**Execution rule:** Small, gated batches. Complete one coherent outcome, review evidence, and obtain approval before proceeding. Do not deploy to production without separate explicit approval.

This document is the current planning source of truth for the next work: documenting the CPU/reliability investigation, deciding whether external compute is justified, and integrating the future Agent Workflow System. It does not replace the existing application implementation specification for the already-planned database, auth, conversation, and file features. Read `docs/IMPLEMENTATION_SPEC.md` for those existing stage requirements, but verify every status against current source and live environment evidence.

## 1. Current verified repository facts

Based on the repository source/configuration inspected for this plan:

- The application is Next.js 16 + React 19 + TypeScript, AI SDK, and OpenNext on Cloudflare Workers.
- The default text model is Cloudflare Workers AI `@cf/zai-org/glm-4.7-flash`.
- The chat endpoint uses the AI SDK streaming path and has bounded request/context/tool handling and stage diagnostics.
- Tavily is integrated through `tools/web_search.ts` and `lib/tavily-search.mjs`; do not replace or duplicate it without evidence.
- Vision model configuration and image attachment support are present in the documented/current pipeline, but provider availability and live behavior must be verified before changing limits or routing.
- Voice transcription uses the Cloudflare Workers AI Whisper binding from `app/api/transcribe/route.ts`; source currently enforces a 15-minute recording session and a 20 MiB audio request limit.
- Supabase integration exists for authentication and secure application diagnostics. Migration files exist in `supabase/migrations/`; file presence does not prove every migration has been applied to the live project.
- Owner-only administration and MFA/AAL2 controls must be preserved.
- The owner has confirmed that password recovery now works after the MFA/AAL2 recovery fix. Do not redesign it without a demonstrated defect.
- `wrangler.jsonc` enables Workers observability. This is not evidence that native Cloudflare logs are being ingested into Supabase.
- Existing docs describe future conversation persistence, private attachment storage, document processing, and the Agent Workflow System. Their current completion state must be checked against code and live tests before execution.
- Resend is the intended email-delivery direction. Existing setup documents still describe Brevo/Supabase custom SMTP. Treat migration to Resend as unimplemented until code/configuration and a successful live email test prove otherwise.

These facts are source/document observations, not a claim that production is currently deployed at this commit or that all live features have passed acceptance tests.

## 2. Decisions already fixed unless new evidence requires review

- Preserve the existing application UI and working user flows.
- Keep Cloudflare as the primary application entry point.
- Keep text generation on Cloudflare Workers AI unless measurement demonstrates a strong reason to change it.
- Keep Supabase for PostgreSQL, authentication, and private storage.
- Keep Tavily unless there is a documented technical or cost reason to replace it.
- Keep provider secrets server-side.
- Keep owner administration owner-only and protected by server-verified MFA/AAL2.
- Do not add image generation.
- Do not begin GitHub integration as part of this work.
- Prefer low-cost, low-complexity infrastructure; do not assume free-tier capacity or lack of billing requirements.
- Do not introduce a queue, Redis, another database, or a second orchestration framework without a demonstrated need.
- Never infer production deployment success from passing CI.

## 3. Problem statement and evidence standard

Cloudflare error 1102 / HTTP 503 has been associated with reports of CPU exhaustion. Potentially expensive paths include Tavily response processing, audio conversion/transcription preparation, image/vision preparation, and document extraction. Do not assume every failure shares the same root cause.

For each failure, separate:
- Worker CPU time, where runtime evidence exposes it.
- Wall-clock request duration.
- External provider latency.
- Payload size and parsing/serialization work.
- Memory and request-size limits.
- Provider quota, rate-limit, and availability errors.
- Runtime/configuration errors.

Before moving a workload, capture a reproducible baseline or clearly state which runtime metric is unavailable. A network call being slow does not itself prove it consumed Worker CPU. Moving only the provider call will not help if the expensive work is still done in the Worker.

## 4. Proposed target architecture to validate

### Cloudflare application layer
Keep routing, existing session checks, authorization, request validation, lightweight orchestration, chat UI delivery, and Cloudflare Workers AI text generation on the current application where they fit actual runtime limits.

### External processing service — candidate, not yet selected
Evaluate a small, modular external compute service for measured CPU-heavy transformations and/or provider tasks. Candidate workloads:
- Tavily result normalization/filtering if measurements show this is expensive.
- Audio transcription preparation or transcription if that is the bottleneck and provider economics/quality justify moving it.
- Image/vision processing if the current route is the source of CPU failures.
- PDF/document extraction if it needs more runtime than the Worker can safely provide.

Evaluate Google Cloud Run, Google Cloud Functions, and other genuinely suitable options using current official quotas/pricing. Prefer one small service with clear modules over separate microservices unless runtime, security, or scaling requirements justify separation.

### Supabase
Continue using Supabase for the existing auth/database/storage architecture. If durable workflow records are needed, inspect the actual schema and migration state first; reuse existing tables where appropriate.

### Queue/cache
Use synchronous request/response when bounded and reliable. Introduce a queue only for workloads that require durable retries, long execution, or user-visible background progress. Introduce caching only when repeated work is likely and cache isolation/freshness can be enforced safely.

### Agent Workflow System
The proposed workflow module uses Cloudflare Workflows, Supabase run/run-event persistence, and Supabase Realtime. Verify current Cloudflare capabilities and existing app/schema before finalizing the design. Define a single authority for execution status and a reconciliation strategy between workflow state and database events. Realtime should notify authorized clients; a database row alone must not be treated as proof that an external step completed.

## 5. Four small implementation batches after this documentation batch

The work should remain in a small number of reviewable batches. Within a batch, use explicit gates for individual workloads rather than implementing every integration at once.

### Batch 1 — Documentation consolidation (current task)
- Reconcile the current docs with repository source and the owner-confirmed password-recovery status.
- Mark historical AI-pipeline recovery notes as historical rather than leaving stale “in progress” status.
- Establish this plan as the next-phase planning source of truth.
- Do not change application source, schema, secrets, or deployment.
**Gate:** document links and status statements are consistent; diff contains documentation only; review the PR before merge.

### Batch 2 — Measurement and architecture decision
- Trace chat/search, transcription, vision, and document paths from route to provider.
- Identify the exact processing steps that run in the Worker and where measurable CPU/time/payload evidence exists.
- Record a baseline for reproducible failure cases and identify unavailable metrics.
- Compare external compute providers, free-tier constraints, billing requirements, cold starts, runtime limits, and operational complexity using current official sources.
- Choose one first workload and decide whether it should remain synchronous or become a durable job.
**Gate:** written decision record, data-flow diagram, security boundary, cost/risk comparison, and test plan approved before provisioning infrastructure.

### Batch 3 — External compute foundation and first workload
- Provision only the approved external service after owner approval.
- Implement a minimal authenticated service boundary with strict payload bounds, timeouts, safe errors, idempotency where needed, redacted correlation IDs, and health/smoke tests.
- Migrate only the first selected workload behind a controlled feature/config switch or equivalent rollback path.
- Keep existing behavior available for rollback until acceptance passes.
- Add only the deployment/configuration scripts required for this service.
**Gate:** automated tests and service build pass; service-to-service auth, payload limits, timeout, provider failure, and redaction tests pass; staging/preview smoke test passes; comparative evidence shows whether the targeted Worker processing was reduced. No production deployment without explicit approval.

### Batch 4 — Remaining workloads, Agent Workflow System, and end-to-end acceptance
- Reassess each remaining workload independently; migrate only those justified by evidence and cost.
- Implement the Agent Workflow System after its dependencies and authority/reconciliation model are approved.
- Integrate run/run-event persistence, user-scoped RLS, Realtime updates, duplicate-submission protection, cancellation/retry behavior, reconnect recovery, and cleanup.
- Run full application acceptance and document remaining limitations.
**Gate:** each migrated workload has its own test evidence; workflow state transitions and recovery are tested; all existing CI checks pass; live provider/browser checks are recorded separately; production deployment remains separately authorized.

If the review finds that the external compute layer is unnecessary, Batch 3 must not provision it merely to follow this outline. A documented simpler solution is acceptable.

## 6. External service requirements to decide, not pre-approve

Potential requirements include:
- External HTTP endpoint or internal service API.
- Service-to-service authentication using a high-entropy secret or stronger mechanism supported by the chosen platform.
- Replay protection where relevant.
- Per-route/request limits and strict input/output schemas.
- Timeout and cancellation propagation.
- Idempotency for retryable jobs and side effects.
- Provider adapters that do not leak credentials.
- Health check and deployment smoke test.
- Redacted structured logs and correlation IDs.
- Environment-specific configuration for local, preview, and production.
- Secret management and rotation instructions.
- Deployment, validation, and rollback scripts.
- Rate limiting and quota handling.
- Temporary payload cleanup.
- Queue, dead-letter handling, or durable job status only if justified by long-running work.

Each item must be classified as required, optional, deferred, or not needed, with a reason. Do not add a public unrestricted processing API.

## 7. Cache and queue rules

For every proposed cache:
- Define key, TTL, size bound, invalidation, and freshness expectations.
- Prevent cross-user leakage. Private/user-specific content must be scoped to the authenticated user and tenant.
- Do not cache secrets or raw sensitive payloads.
- Do not use cache hits to bypass authorization.

For every proposed queue:
- Define job ownership, lifecycle, idempotency, retry cap/backoff, cancellation, permanent failure, retention, and cleanup.
- Preserve partial results with explicit partial status.
- Do not retry side effects unless they are idempotent.
- Explain whether the user waits for a response, receives background progress, or reconnects to a durable job.
- Do not create a queue if a bounded synchronous call is adequate.

## 8. Agent Workflow System design requirements

Before implementation, specify:
- Workflow start/submit contract and duplicate-submission prevention.
- Stable run ID and event ID rules.
- Run states: running, completed, failed, cancelled, and any justified intermediate states.
- Which system is authoritative for execution status.
- How Cloudflare Workflow state and Supabase records are reconciled after partial failure.
- Which events are durable and which are notifications only.
- User-scoped authorization and RLS for run/event reads.
- Realtime channel authorization and reconnect/resume behavior.
- Step retries, idempotency, cancellation, timeouts, partial completion, and cleanup.
- External service integration and error propagation.
- Retention and diagnostic correlation.
- UI states for pending, running, completed, failed, cancelled, and reconnecting.

Do not implement a second workflow engine. Distinguish a normal synchronous chat request, a single asynchronous processing job, and a durable multi-step agent workflow.

## 9. Security and diagnostics

- Preserve server-side session verification, disabled-user checks, invite-only access, owner-only administration, and AAL2 requirements.
- Never put provider/service credentials in browser code or logs.
- Validate URL inputs and protect against SSRF if any service fetches arbitrary URLs.
- Bound request bytes, result bytes, image/audio/document sizes, concurrency, runtime, and provider calls.
- Keep user data isolated in cache, jobs, storage, database queries, and Realtime channels.
- Reuse `recordSecureDiagnostic` and the existing diagnostic sink when appropriate; do not create one table per feature.
- Never log prompts, transcripts, audio, passwords, cookies, authorization headers, API keys, or raw provider payloads.
- Distinguish application diagnostic rows from native Cloudflare logs. Clearing Supabase diagnostic rows must not be described as deleting native Cloudflare logs.
- Propagate only safe correlation IDs across service boundaries.
- Preserve the existing owner-only/AAL2 access model for diagnostic administration.

## 10. Required scripts and operator steps

Do not create these during planning. After the architecture is approved, decide which are needed and use existing project conventions. Candidate scripts include:
- External service local development/start.
- External service build and validation.
- External service deployment.
- Service health check.
- Preview/staging smoke test.
- Environment/configuration validation without printing secret values.
- Database migration/status verification if schema changes are approved.
- Cleanup job only if persistent temporary objects/jobs are introduced.

Document which steps require manual cloud-dashboard configuration, which resources must be provisioned, and which secrets must be configured out of band. Do not put production secrets in the repository or scripts. Do not run production deploy scripts without explicit approval.

## 11. Test and acceptance matrix

Every implementation batch must include applicable tests:
- Unit and integration tests for provider adapters and payload bounds.
- Tavily success, timeout, 429, 5xx, malformed/oversized response, URL normalization, and partial results.
- Transcription/image/document provider failures, input validation, and size boundaries.
- Service authentication and unauthorized requests.
- Timeouts, cancellation, retries, idempotency, and permanent failures.
- Cache key isolation and freshness, if caching is added.
- Queue ownership/retry/recovery, if queues are added.
- Workflow lifecycle, duplicate submissions, RLS, Realtime authorization, reconnect, reconciliation, and cleanup.
- Diagnostic redaction and correlation.
- Existing unit tests, lint, TypeScript checks, and Cloudflare Worker build.
- External-service build and deployment smoke tests, if an external service is selected.
- Manual browser/live-provider tests documented separately from CI.

A successful build does not prove the feature works in production. Record commit SHA, CI run, deployment status, manual test evidence, and unverified items.

## 12. Open decisions requiring owner approval

1. Which external compute provider, if any, should be used after current quota/cost research?
2. Which single workload should be migrated first based on measured evidence?
3. Should the first workload remain synchronous, or does it need durable asynchronous processing?
4. What is the maximum acceptable recurring cost and whether a payment method is acceptable?
5. Which external-service environment (preview/staging) can be provisioned safely?
6. When to implement the Agent Workflow System relative to workload migration; default is after the first external workload and its service boundary are proven.
7. Resend migration details and whether Supabase Auth emails should use Resend SMTP or another supported delivery arrangement; do not assume it is already configured.
8. Whether the planned public landing page/domain separation remains in the immediate scope or stays deferred.

Do not ask the owner to decide technical details that can be settled by source inspection and documented evidence. Recommend defaults and present only material decisions.

## 13. Documentation hierarchy

- `docs/NEXT_PHASE_PLAN.md`: current plan for CPU/reliability investigation, external compute, and Agent Workflow System.
- `docs/IMPLEMENTATION_SPEC.md`: staged requirements for existing app foundation, authentication, persistence, file handling, and related product features. Its progress statements must be verified against current source; stage descriptions are not proof of completion.
- `docs/AI_PIPELINE_REQUIREMENTS.md`: requirements reference for streaming, bounds, provenance, retries, and observability.
- `docs/AI_PIPELINE_BATCH_PLAN.md`: historical AI-pipeline recovery batch design; consult it for applicable tests, not as the status authority for this next phase.
- `docs/AI_PIPELINE_RECOVERY_STATUS.md`: historical recovery notes plus a pointer to the current status source.
- `docs/SECURE-APPLICATION-DIAGNOSTICS.md`: diagnostics behavior, access, retention, and Cloudflare-log limitations.
- `docs/architecture/*`: detailed auth, schema, and invited-user design documents; reconcile their provider/setup instructions before following them.
- `docs/REUSABLE-FOUNDATION-PLAN.md`: historical audit only; its Better Auth/Neon/R2 recommendations are superseded.

When two documents disagree, first verify the source and approved decisions. Update the owning document instead of adding a third competing specification.
