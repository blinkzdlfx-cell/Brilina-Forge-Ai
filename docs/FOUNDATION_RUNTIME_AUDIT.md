# Foundation and Runtime Audit — Brilina Forge AI

**Audit date:** 2026-10-24  
**Repository:** `blinkzdlfx-cell/Brilina-Forge-Ai`  
**Baseline:** `main` at `f513354b889ab4f83b66fed00285d7a7241ef7d9` (PR #27 merge)  
**Scope:** Source and repository test review. No production environment was changed.

## Executive summary

The owner confirms that the prior Foundation Batch 1 acceptance tests for authentication, MFA/AAL2, creating test accounts, and password recovery worked. Those checks are accepted and should be preserved, not rebuilt. The CI run associated with the PR #27 merge completed successfully: unit tests, lint, typecheck, and the existing Cloudflare Worker build all passed.

This audit is based on repository source and tests, plus the owner's acceptance confirmation. It does not independently prove the live Supabase migration state, production provider configuration, or production deployment behavior.

## Evidence matrix

| Requirement | Source evidence | Automated test evidence | Live evidence | Status / next action |
|---|---|---|---|---|
| Authentication, MFA/AAL2, test accounts | Auth guards and owner-only admin APIs exist | Owner reports acceptance tests passed; security contract test checks AAL2 enforcement | Accepted from owner testing; not independently re-run in this audit | **Accepted**; preserve |
| Password recovery | Recovery routes and prior fix exist | Prior acceptance confirmed by owner | Accepted from owner testing | **Accepted**; revisit only if a regression appears |
| Chat route authorization and streaming | `app/api/chat/route.ts` uses `requireUser()`, AI SDK streaming, bounded tool steps/tokens | Security and streaming contract tests exist; merge CI passed | Production request behavior not independently tested | **Source/test present**; preserve |
| Transcription authorization and session enforcement | Transcription route uses `requireUser()`; session timestamps are server-side; audio payload limit is 20 MiB | Contract tests cover authentication and session guardrails; merge CI passed | Live provider/session behavior not independently tested | **Source/test present**; 10-minute limit aligned in this branch |
| Tavily search safeguards | `lib/tavily-search.mjs` bounds results/excerpts/response size and retries | Tavily tests exist; merge CI passed | Provider quota and production search behavior not independently tested | **Source/test present**; preserve and measure in runtime testing |
| Secure diagnostics | Redacted logger, owner/MFA-protected diagnostics API, read/unread/clear lifecycle | Diagnostic contract tests exist; merge CI passed | Live table/policies and insert/delete behavior not independently verified | **Source/test present; live unknown** |
| Supabase schema and RLS | Four SQL migration files define conversations/messages/files/user access, recording sessions, and diagnostics | Static contract tests inspect selected ownership/RLS invariants | Repository files do not prove migrations are applied remotely | **Source present; live unknown**; verify read-only before depending on it |
| Durable conversation history | Chat UI uses AI SDK client state; no completed conversation load/save API path found in inspected source | No behavioral persistence test found in inspected tests | Unknown | **Implementation gap**; next major feature |
| Private file upload/storage | File metadata table exists; inspected paths did not show complete Storage upload, signed URL, and durable file-reference flow | No full storage workflow test found | Unknown | **Implementation gap**; design using private Supabase Storage and user-scoped authorization |
| Vision | Model registry supports Cloudflare/Groq vision options and image validation | Image-input tests exist | Provider credentials/limits and real image requests not independently verified | **Partial**; test against chosen runtime/provider |
| PDF/TXT/DOCX processing | No complete document extraction pipeline found in inspected source | No end-to-end document test found | Unknown | **Not established as implemented**; design after runtime decision |
| Agent Workflow System | No complete durable workflow runs/events/retry/recovery implementation found in inspected source | No end-to-end workflow test found | Unknown | **Pending**; design once primary runtime is selected |
| Runtime portability | OpenNext/Wrangler, Cloudflare environment access, and direct Cloudflare transcription binding are present | CI validates only the current Cloudflare build | Google Cloud compatibility untested | **Migration work required**; make a compatibility proof before migrating |
| CI pipeline | Tests, lint, typecheck and Worker build run; workflow uses `pnpm install --no-frozen-lockfile` and can commit a refreshed lockfile on main | Merge run completed successfully | No production deployment verification implied | **Passing with pipeline improvement opportunity**; later consider frozen lockfile and least-privilege write permissions |

## Runtime findings

- The current app is a Next.js application deployed through OpenNext on Cloudflare Workers.
- `lib/runtime-env.ts` reads Cloudflare bindings and falls back to `process.env`.
- The transcription session route depends on the runtime environment reader; the transcription provider itself is Cloudflare Workers AI.
- The chat endpoint uses AI SDK native streaming; preserve this behavior during migration.
- Supabase remains the intended provider for Auth, Postgres, and private Storage unless a later evidence-based decision changes that.
- Do not add a second backend merely to work around the CPU limit. First prove the main app's compatibility with a single primary runtime.

## Google Cloud decision

**Provisional candidate: Google Cloud Run for the complete Next.js app.** It is the more natural fit for a containerized application with multiple server routes and streaming. This is not yet a final migration decision: build a minimal compatibility proof, check current quotas/pricing and billing requirements, and verify auth/session behavior before selecting it. Cloud Run functions remains an option for genuinely independent event/request handlers if a measured need appears; avoid splitting routes into functions without a concrete reason.

The compatibility proof must cover: Next.js startup/build, sign-in and session refresh, protected admin route behavior, chat streaming, request body limits, transcription provider calls, secrets, logs, cold starts, and graceful failure. Use a test environment, not production.

## Approved immediate change: 10-minute voice recording

The owner explicitly requested a 10-minute limit for now, with the option to change it later. The implementation branch aligns:
- browser auto-stop threshold;
- server-side session age validation;
- server rejection message;
- security contract test;
- implementation specification and roadmap.

The limit remains server-enforced; the UI must not display a countdown. Audio size remains separately bounded. The change is isolated and does not alter authentication or MFA behavior.

## Recommended implementation order

1. Merge the 10-minute limit change after CI passes.
2. Finalize the architecture decision with a small Cloud Run compatibility proof and current cost/billing review; no production migration yet.
3. Implement durable conversations and messages using the existing schema, with user isolation and persistence tests.
4. Implement private Supabase Storage uploads and safe file references/signed access.
5. Add document processing and harden vision through the chosen runtime and provider.
6. Implement the Agent Workflow System with durable runs/events, retries/recovery, and user-scoped authorization.
7. Add production telemetry/acceptance tests and perform a controlled migration with rollback.

## Explicitly not done

- No production deployment, DNS changes, project provisioning, billing setup, secret rotation, or Supabase migration was performed.
- No claim is made that the live Supabase schema/policies have been verified.
- No new backend, queue, cache, Redis instance, or database was introduced.
