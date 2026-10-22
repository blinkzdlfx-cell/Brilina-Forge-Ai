# Future Invited-User Limits — Design Note Only

**Repository:** `blinkzdlfx-cell/Brilina-Forge-Ai`  
**Status:** Documentation only. No code, database schema, RLS policy, or UI for quotas is authorized in this phase.

This document records a future design for owner-managed per-user usage limits. It must not delay or expand the current ten-stage implementation plan. Do not create quota tables or enforce these limits until separately approved.

## Goals

- Protect shared free-tier allocations from being exhausted by one user.
- Give each user predictable, transparent limits.
- Let the owner adjust per-user limits without editing application code.
- Enforce limits server-side; UI indicators are informational and never a security boundary.
- Avoid implying that application-level quotas guarantee provider-level availability or exact billing behavior.

## Candidate per-user limits

The owner may later configure limits for each user, with sensible application defaults:

1. **Messages per day** — count accepted user turns, not streamed chunks. Define the reset timezone/window explicitly.
2. **Web searches per month** — count Tavily calls, including calls that return no results if the provider request was made. Tavily's free quota is shared across all users, so include both a per-user cap and a global safety budget.
3. **File uploads** — maximum files per day or month, plus maximum total retained storage per user.
4. **File types and sizes** — allowlist of supported MIME types/extensions, maximum bytes per file, and any image dimension/page limits required by providers.
5. **Transcription usage** — maximum transcription requests, audio duration, and/or total audio minutes per day or month.
6. **Models and tools** — per-user allowlists for available models and tools, including web search, vision, and document processing.

Do not assume the limits should be identical for every user. The owner should be able to apply a default profile and override individual users.

## Potential storage design — future only

A later phase could introduce a server-managed user limits table and usage counters, for example:

- per-user configuration: daily message allowance, monthly search allowance, upload count/storage ceiling, transcription allowance, allowed models/tools;
- usage records or counters keyed by user, capability, and reset period;
- optional global provider budget counters for shared allocations.

The owner could edit limits from the existing owner-only `/admin` screen. Normal users must not be able to insert or change their limits. RLS must prevent client-side edits; only trusted server-side admin operations should modify configuration. This is a design option, not a schema decision, and no tables should be added in the current phase.

## Server-side enforcement model — future only

Every relevant server route would authenticate the session, verify the user is enabled and has completed any required password change, then check the appropriate quota before calling a provider:

- Chat route: messages per day, allowed model, and tool availability.
- Tavily tool: per-user monthly searches and global shared-quota safety budget.
- File upload routes: allowed type, maximum size, file count, and retained storage.
- Vision provider: allowed vision capability, per-user request limits, and image limits.
- PDF/document processing: allowed document capability, supported formats, and per-user processing limits.
- Transcription route: allowed transcription capability, duration/bytes, and usage allowance.

Quota checks must be atomic or otherwise safe under concurrent requests. A simple read-then-write counter can overrun limits when two requests arrive together. The future implementation should choose database transactions, a safe RPC, or another suitable atomic approach. Failed requests and provider retries need defined counting semantics so users are not charged twice by application counters unintentionally.

If a request is rejected before a provider call, it should not consume provider usage. If a provider request has already been sent, record it as attempted even if the provider times out, unless reliable provider telemetry proves otherwise. Document any uncertainty.

## User experience — future only

When a user approaches or reaches a limit, the UI should show:

- the capability affected;
- current usage and the configured limit, when reliable;
- when the counter resets;
- whether the feature is temporarily unavailable due to a shared provider quota;
- what remains usable, such as normal text chat when Tavily or vision is exhausted.

Use clear messages such as “Your monthly web-search allowance has been reached. It resets on [date/time]. Normal chat is still available.” Do not show raw provider errors, secret values, internal counters, or another user's usage. Do not display a button that suggests a paid upgrade or alternative provider unless that capability has actually been configured and approved.

## Owner controls — future only

The owner admin screen could later allow the owner to:

- set a default limits profile;
- override an individual user's limits;
- enable/disable models and tools per user;
- inspect usage by user and capability;
- reset a counter when appropriate;
- inspect quota rejections and provider exhaustion without exposing prompts, passwords, file contents, or secrets.

Every owner action must remain protected by server-verified owner status and an MFA-verified `aal2` session. Audit changes without logging sensitive content.

## Shared free-tier resources to protect

- **Cloudflare Workers AI:** text generation and transcription usage, depending on enabled capabilities and current account allocation.
- **Tavily:** shared web-search credits across all users.
- **Vision provider (initial candidate: Groq):** image requests, image count/size, model availability, and provider quota.
- **PDF/document provider (initial candidate: Gemini):** document requests, input size/page limits, and available free allocation.
- **Supabase PostgreSQL:** query/compute and database resource limits.
- **Supabase Storage:** file count, total storage, upload bandwidth, and download bandwidth.

Provider free plans can change. Before implementing any limit defaults, verify the current provider allocations and plan rules. Per-user quotas are an application safety control, not a promise that provider quotas cannot be exhausted.

## Acceptance criteria for a future implementation

- Limits are stored and changed only through trusted server-side paths.
- Every relevant route enforces limits regardless of UI state.
- Concurrent requests cannot routinely bypass counters.
- Limit reset windows and timezone are documented.
- Users see clear, non-sensitive limit messages.
- Owner actions require MFA/AAL2.
- Global shared-quota protections coexist with per-user limits.
- Tests cover boundaries, resets, concurrent requests, retries, disabled users, and unauthorized limit edits.

**Current phase boundary:** Do not implement any of the above. This file is a design note only.


## Workflow usage — future limits candidate

The Agent Workflow System adds substantial shared-resource usage. Treat the following as candidate owner-configurable limits for a future approved quota implementation, not active enforcement in the current planning phase:

- **Workflow runs per user per day** and optionally per month.
- **Maximum stages per plan** and **maximum execution/tool steps per run**.
- **Maximum events per run** and retention/storage budget for run histories and referenced artifacts.
- **Planner/executor/label-model calls** as part of each user's shared Workers AI allowance.
- **Tavily calls, file processing, and vision/document operations** initiated by workflow tools, counted against the same per-user and global provider budgets as direct use.
- **Concurrent active runs per user** as a candidate safeguard, subject to Cloudflare Workflows account-wide limits.

Enforce future limits server-side with concurrency-safe counters/transactions. A workflow must not bypass existing message, search, file, transcription, model, or tool limits by routing the action through a stage. Report which limit was reached, the reset window where known, and what remains usable. Keep large event payloads and artifacts out of Realtime messages; store them by reference and apply retention/cleanup policies.

This section is documentation only. It does not authorize quota tables, enforcement code, or admin UI.
