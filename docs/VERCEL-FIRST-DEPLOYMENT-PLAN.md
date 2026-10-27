# Vercel-First Runtime and Deployment Notes

**Status:** Vercel is the current production application platform. This document is subordinate to `docs/NEXT_PHASE_PLAN.md`, which defines the four substantial implementation batches and their acceptance gates.

## Deployment roles

- **Vercel:** primary Next.js 16 / React 19 application runtime. The current production deployment is `https://brilina-forge-ai.vercel.app`; the intended custom domain is `https://forge.brilinadev.name.ng`.
- **Cloudflare Worker:** retained fallback at `https://brilina-forge-ai.blinkzdlfx.workers.dev`. Do not remove it or direct ordinary Vercel application requests through it without a specific reason.
- **Cloudflare Workers AI:** existing provider called over HTTPS for configured text, vision, and speech models. Application code running on Vercel must use server-side credentials and must not require Cloudflare-only request bindings.
- **Cloudflare DNS/edge services:** retain the existing configuration; no DNS changes are included in implementation batches.
- **Supabase:** existing Auth, PostgreSQL, and private Storage; preserve live data and policies.
- **Tavily:** preserve the existing search implementation. DuckDuckGo is only an optional additive candidate after its official API capability and terms are verified.

## Source-review findings

The current `main` branch includes the conversation lifecycle, idempotent message-save support, private file APIs, upload-first file references, and document/image processing merged in PR #30. These must be audited and tested, not rebuilt by default.

The repository also contains Cloudflare-specific runtime configuration (`open-next.config.ts`, `wrangler.jsonc`, and `lib/runtime-env.ts`). Preserve the Worker deployment, but verify that Vercel request paths do not depend on Worker-only bindings.

The Vercel status check on the current main commit is successful. This confirms the deployment integration's reported status only; it does not prove authenticated chat, streaming, transcription, provider, file ownership, or persistence workflows have passed live acceptance.

The existing CI runs unit tests, lint, type checking, the Cloudflare Worker build, and a Docker build. It now also runs the native Next.js `pnpm build` as a separate Vercel-runtime compatibility check. The Cloudflare build remains intentionally separate.

## Important Vercel payload constraint

Vercel Functions document a 4.5 MB request/response payload limit. The current application-level file and audio routes allow 10 MiB and 20 MiB respectively, which means those limits alone do not guarantee that the request reaches the route.

The implementation must use an authenticated direct-to-private-Supabase-Storage upload flow for large files/audio, or another verified path that does not proxy an oversized binary through a Vercel Function. A server route should accept a compact file/session reference, verify ownership, and process the object through a bounded provider path. Do not assume that a provider can read every signed URL; verify provider support. Never send base64 file contents in chat messages.

## Execution and deployment flow

Follow the four-batch sequence in `docs/NEXT_PHASE_PLAN.md`:

1. Vercel runtime foundation, portability, native streaming, and verification.
2. Conversation reliability, persistence, and private upload flows.
3. Provider workflows: Tavily, optional DuckDuckGo evaluation, transcription, vision, documents, and email verification.
4. Agent Workflow System and full application acceptance.

For each batch, implement the related scope as one substantial body, run unit and custom workflow tests, lint, typecheck, native Next.js build, retained Cloudflare build, and applicable preview tests. Fix failures and repeat verification before proceeding.

## Production safety

- Do not deploy to production, change DNS, alter production secrets, apply live Supabase migrations, or provision paid infrastructure without separate explicit approval.
- Keep the Cloudflare deployment available as a rollback option until Vercel workflows pass acceptance.
- Do not equate a successful build or deployment status check with live provider/browser verification.
- Record any workflow that cannot be tested due to missing live credentials or authorized browser access as **unknown**, not complete.
