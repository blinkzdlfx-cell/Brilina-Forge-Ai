# Brilina Forge AI — Consolidated Architecture and Implementation Plan

**Status:** Planning and audit only. This document does not authorize provisioning, secret changes, schema changes, or production deployment.  
**Repository:** `blinkzdlfx-cell/Brilina-Forge-Ai`  
**Application baseline reviewed:** `main` at `ee35aaef5dae79d4ab7fb695b9f3f1e133f47ea5` (2026-10-24)  
**Current deployment:** Cloudflare Worker `brilina-forge-ai` — `https://brilina-forge-ai.blinkzdlfx.workers.dev`  
**Supabase project:** `jjocynbtuafdokkjemym`  
**Execution rule:** One coordinated workstream. Complete each gated phase, report evidence, and obtain approval before implementation beyond the approved scope. No production deployment without separate explicit approval.

This is the controlling roadmap for architecture, reliability, the existing foundation, and the future Agent Workflow System. `docs/IMPLEMENTATION_SPEC.md` remains the product requirements catalogue, but its older Cloudflare-specific runtime assumptions are subordinate to the architecture decision in this plan.

## 1. Audit findings — Batch 1 must not be rebuilt by default

Source inspection of current `main` found:

- **Tavily guardrails:** `lib/tavily-search.mjs` already has a five-result cap, 1,200-character per-excerpt cap, 4,000-character aggregate excerpt cap, 128 KiB response bound, URL normalization/deduplication, bounded retry handling, and safe errors.
- **Protected chat:** `app/api/chat/route.ts` calls `requireUser` and bounds request/context/tool work.
- **Protected transcription:** `app/api/transcribe/route.ts` calls `requireUser`; it currently uses Cloudflare Workers AI Whisper and source-level limits of 20 MiB audio and a 10-minute recording session.
- **Database foundation:** migrations `0001_initial_schema.sql`, `0002_voice_recording_sessions.sql`, `0003_secure_application_diagnostics.sql`, and `0004_diagnostic_lifecycle.sql` exist in the repository.
- **Runtime coupling:** `lib/runtime-env.ts` reads Cloudflare bindings and falls back to `process.env`; the transcription route imports OpenNext/Cloudflare context directly. These are concrete migration touchpoints, not proof the whole app must be rewritten.
- **Existing auth/security:** Supabase auth integration, owner administration, MFA/AAL2 checks, and secure diagnostic handling are present in the source/docs. The owner confirmed password recovery works after the MFA/AAL2 recovery fix; do not redesign it without a demonstrated defect.
- **What is not verified:** repository migration files do not prove they were applied to the live Supabase project; source-level auth does not prove live account/RLS/MFA/revocation acceptance; CI does not prove live provider/browser behavior or deployment state. Conversation persistence, private file storage, document processing, and workflow status require a source-and-live-evidence audit before being classified as complete or pending.

**Audit update (2026-10-24):** the owner confirms the previous authentication, MFA/AAL2, test-account creation, and password-recovery acceptance tests passed. Treat those checks as accepted and preserve the implementation; do not rerun or rebuild them absent a demonstrated regression. The CI run associated with PR #27 completed successfully: unit tests, lint, typecheck, and Cloudflare Worker build passed. This is repository CI evidence, not live production verification.

**Initial conclusion:** the core code for the previous Foundation Batch 1 appears substantially present on current `main`. Do not implement it again. The next step is a gap audit: verify tests and source contracts, identify any exact missing checks, and verify live Supabase setup only through authorized read-only inspection or user-provided evidence. Report each item as **source present**, **automated test present/passing**, **live verified**, or **unknown**. Do not mark a feature complete based on one evidence category alone.

## 2. Architecture direction

The user wants a complete, stable architecture that is not forced to keep CPU-heavy application work on Cloudflare because of the Workers free-tier CPU limit. Therefore, do **not** assume Cloudflare remains the primary application runtime, and do **not** jump straight to adding a second processing service beside an otherwise unchanged backend.

Evaluate two coherent target shapes before implementation:

1. **Google Cloud Run:** candidate for hosting the Next.js/OpenNext-compatible application runtime and/or a modular backend service, subject to adapter/runtime compatibility, streaming, session, and cost checks.
2. **Google Cloud Functions:** candidate for discrete request/event handlers or provider tasks; verify whether it is suitable for the complete Next.js application before selecting it as the main runtime.

Compare these with the existing Cloudflare deployment using current official documentation and a small compatibility proof. Evaluate: framework/runtime compatibility; streaming behavior; CPU and wall-clock limits; request/body limits; execution duration; cold starts; concurrency; background work; logs/metrics; secrets and service-to-service auth; region/latency; free-tier limits and billing/payment requirements; deployment complexity; and rollback. Do not assume that a free allowance means no billing account or payment method is required.

**Architecture rule:** select one primary server runtime for each responsibility. Cloudflare may remain for DNS/CDN/edge routing if it adds value, but avoid duplicate API implementations and split-brain auth/orchestration. Keep Supabase for PostgreSQL/Auth/private Storage unless evidence justifies a change. Keep Tavily unless evidence supports replacement. Text-model placement is an explicit decision in this review; the existing Cloudflare Workers AI model is a current behavior, not an unchangeable hosting requirement.

## 3. Diagnose CPU/reliability with evidence

Cloudflare error 1102 / HTTP 503 has been associated with CPU exhaustion, but do not assume all failures have one cause. Trace chat/search, transcription, vision, and document paths end-to-end. Separate:

- actual CPU time where available;
- total wall-clock duration and provider latency;
- bytes read, decoded, parsed, encoded, or serialized;
- request/response sizes and memory pressure;
- provider quota, rate limits, timeouts, and availability;
- runtime/configuration errors.

Use reproducible inputs and redacted correlation IDs. Never log prompts, transcripts, audio, cookies, credentials, raw provider payloads, or private file contents. If CPU telemetry is unavailable, state that limitation and use a controlled comparative test; do not infer CPU usage from a slow request alone.

## 4. One sequential delivery plan

### Phase A — Complete this documentation review

- Update this roadmap and `docs/IMPLEMENTATION_SPEC.md` so the target runtime is an open architecture decision centered on Google Cloud Run vs Google Cloud Functions, rather than a pre-decided Cloudflare-primary design.
- Keep the prior Foundation Batch 1 requirements, but label their implementation status as audited/partially verified, not pending by default.
- Preserve the historical recovery notes and the existing UI/security decisions.
- Keep the PR documentation-only.
**Gate:** review the diff, links, and CI; do not merge automatically.

### Phase B — Foundation gap audit (no duplicate implementation)

Inspect current `main`, tests, migrations, environment readers, auth/admin APIs, voice-session checks, diagnostic handling, and current feature flags. Build an evidence table for the previous Batch 1 (Tavily bound, schema/RLS, protected auth/admin/password lifecycle/transcription) and for later stages. Check live Supabase state only through authorized, read-only evidence; never reset or reapply migrations to “make sure.”

Deliver:
- completed / source-present / test-covered / live-verified / unknown status per requirement;
- exact gaps and the minimum tests needed to close them;
- a list of Cloudflare-specific dependencies and portable application-level controls;
- no code changes unless separately approved after the audit.

**Gate:** agree on the actual remaining work before any implementation. Do not repeat Batch 1 where source and tests already satisfy the requirement.

### Phase C — Runtime decision and migration design

Compare Cloud Run, Cloud Functions, and retaining some Cloudflare responsibilities using current official quotas/pricing and the audited source. Produce one recommended architecture, a service/data-flow diagram, security boundaries, cost envelope, secrets plan, deployment/rollback plan, and an ordered migration map. Include a minimal compatibility proof for the chosen runtime (especially Next.js routing, streaming, Supabase sessions, and AI SDK behavior) before committing to a full migration.

Define which existing restrictions are application-level invariants and must remain: auth/owner/AAL2 checks, user isolation, request and file validation, safe errors, timeouts, quota handling, redaction, and provider-side secret protection. Adjust only limits that exist solely because of Cloudflare’s runtime. Keep the current application available for rollback until acceptance passes.

**Gate:** owner approval of the architecture and cost/payment requirements before provisioning or migrating production.

### Phase D — Migrate the primary runtime and the first measured bottleneck

Move one coherent application/runtime responsibility at a time, not parallel duplicate implementations. Begin with the minimum viable runtime foundation, then move the first workload selected by Phase C’s evidence. Keep synchronous processing when bounded; add a queue only if work is long-running or needs durable retry/progress. Add caching only with defined freshness, invalidation, and user isolation.

Required tests include service/auth boundaries, streaming, timeout/cancellation, payload bounds, provider failure/quota, redaction, duplicate requests, and rollback. Compare before/after evidence for the original failure case.

**Gate:** build/tests and preview smoke tests pass; no production deployment without explicit approval.

### Phase E — Finish remaining product foundation in dependency order

After runtime stability, complete only verified gaps in this order:

1. Authentication/access, migration/RLS and diagnostics acceptance gaps from Phase B.
2. Conversation/message persistence, including retry/idempotency and interrupted/failed assistant states.
3. Private Supabase Storage and upload-first attachment references; no base64 in chat requests.
4. External vision provider, after file ownership and provider-access controls are proven.
5. PDF first, then TXT, then DOCX; only enable each UI action after its backend passes acceptance.
6. Supabase keep-alive only if current plan rules and activity requirements justify it; choose the scheduler supported by the final runtime rather than assuming Cloudflare Cron.
7. Resend migration only after inspecting current configuration and verifying a live delivery/reset flow; do not treat intent or documentation as completion.

The prior Foundation Batch 1 is audited in Phase B, not restarted as a new implementation batch. Preserve existing UI and password-recovery behavior unless a reproducible defect is found.

### Phase F — Agent Workflow System and end-to-end acceptance

Implement the Agent Workflow System only after runtime, auth, persistence, and file/provider boundaries are stable. First decide whether Cloudflare Workflows remains suitable or whether the selected Google Cloud architecture provides the better durable execution mechanism. Use one workflow engine, one authoritative execution state, durable run/event records where needed, user-scoped RLS, duplicate-submit protection, idempotent retries, cancellation, reconnect recovery, cleanup, and authorized Realtime notifications if Supabase Realtime remains the chosen client update channel.

Run the complete acceptance matrix across auth, RLS, chat streaming, Tavily, vision/documents, voice, persistence, uploads, quota/timeouts, diagnostics, and recovery. Record CI, live-provider/browser results, deployment state, and unverified items separately.

## 5. Portability and security invariants

Preserve these regardless of runtime:

- Server-verified Supabase session and disabled-user checks on private APIs.
- Owner-only admin access and server-verified AAL2; trusted role metadata is not client-editable.
- Secrets remain server-side; no credentials in client bundles, logs, or responses.
- Strict request/body/file limits, schema validation, timeouts, cancellation, provider quota handling, and safe error messages.
- Per-user data isolation in database, storage, cache, jobs, and realtime subscriptions.
- Private storage, ownership checks before provider access, short-lived signed URLs where needed, and no permanent public file URLs.
- Redacted structured diagnostics and correlation IDs. Application diagnostic rows are not native Cloudflare logs; deleting one must not be described as deleting the other.
- Preserve streaming rather than buffering a complete answer and simulating chunks.
- No image generation or GitHub integration in this scope.
- No new database, Redis, queue, cache, microservice, or workflow engine without a measured need and approved design.

## 6. Acceptance and reporting rules

For each phase, record:
- baseline and target commit SHA;
- changed files and why;
- automated tests, lint, typecheck, and applicable build results;
- live tests actually performed and their evidence;
- deployment status (separate from CI);
- known gaps and rollback steps.

A successful CI run is not proof of production deployment or live Supabase/provider acceptance. Do not provision services, change secrets, alter production DNS, apply live migrations, or deploy without explicit approval.

## 7. Documentation authority

- `docs/NEXT_PHASE_PLAN.md`: controlling architecture, audit, and execution roadmap.
- `docs/IMPLEMENTATION_SPEC.md`: product requirements and stage acceptance criteria; runtime-specific assumptions defer to this roadmap until the architecture is approved.
- `docs/AI_PIPELINE_REQUIREMENTS.md`: reusable streaming, bounds, retries, and observability requirements.
- `docs/AI_PIPELINE_BATCH_PLAN.md` and `docs/AI_PIPELINE_RECOVERY_STATUS.md`: historical recovery notes, not current completion trackers.
- `docs/SECURE-APPLICATION-DIAGNOSTICS.md`: diagnostic access, retention, and native Cloudflare log limitations.
- `docs/architecture/*`: detailed design/setup notes; verify their runtime/provider assumptions before following them.
- `docs/REUSABLE-FOUNDATION-PLAN.md`: historical audit only; superseded provider choices are not current requirements.

When documents conflict, verify current source and approved decisions, then update the owning document rather than creating another competing plan.
