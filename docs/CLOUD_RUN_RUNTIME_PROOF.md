# Google Cloud Run Runtime Compatibility Proof

**Status:** Non-production compatibility preparation; container build and CI are the next verification gates.  
**Repository:** `blinkzdlfx-cell/Brilina-Forge-Ai`  
**Primary candidate:** Google Cloud Run service running the complete Next.js app in Node.js.  
**Not authorized or performed:** Google Cloud project provisioning, billing changes, secret creation, deployment, DNS changes, Supabase migrations, or production traffic migration.

## Decision so far

Cloud Run is the preferred primary-runtime candidate for this application because Brilina Forge AI is a full Next.js application with multiple authenticated API routes and AI SDK streaming. Cloud Run can run a standard Node.js container and supports configurable request timeouts up to 60 minutes. Its quotas document HTTP/1 request-size limits and streaming behavior; the service still needs explicit limits, timeout settings, concurrency tuning, and cost controls. This does not mean every request should be allowed to run for the maximum duration.

Cloud Run functions are better reserved for discrete event/request handlers if a measured future need justifies a separate service. Do not split the current app into duplicate API implementations merely to use functions.

## Source compatibility findings

- The project uses Next.js 16, React 19, Node.js >=22, and pnpm 10 in CI.
- Authentication uses Supabase SSR cookies and `next/headers`; preserve cookie refresh and protected route behavior.
- Chat uses AI SDK streaming. Verify time-to-first-chunk and client disconnect handling on Cloud Run.
- The chat route already has a bounded 5 MiB request and provider timeout budget. Cloud Run's infrastructure limits are not a replacement for application-level limits.
- The runtime environment helper reads OpenNext/Cloudflare bindings first and falls back to `process.env`. This is a portability seam to keep under review.
- Text and vision model calls already use provider HTTP APIs and runtime secrets.
- Transcription previously depended directly on the Cloudflare Workers AI binding. This branch changes it to the authenticated Cloudflare AI REST endpoint, using `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_AI_API_TOKEN`, so the provider call can run in ordinary Node.js. The endpoint behavior must be validated with a real authorized test request before production use.
- The transcription route and session route now both enforce a ten-minute recording duration. The UI must not show a countdown; after a limit-triggered successful transcription, it should insert the transcript and show the informational message.
- Supabase remains the database and auth provider. No schema changes or migrations are part of this proof.

## Container proof

The `Dockerfile` builds and starts the existing Next.js application with Node.js 22. The `.dockerignore` excludes local dependencies, build output, Git metadata, and local environment files. Build-time public Supabase values are public configuration; service-role keys and provider tokens must be supplied only as runtime secrets and never baked into the image.

CI should build the container image in addition to the existing unit tests, lint, typecheck, and Cloudflare build. A successful image build verifies packaging, not live Google Cloud behavior.

## Runtime configuration to validate before any deployment

1. Set `PORT=8080` (Cloud Run injects a port; the application must listen on it).
2. Supply `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` through the appropriate build/runtime configuration. Never expose the service-role key to the browser.
3. Supply `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_AI_API_TOKEN`, `TAVILY_API_KEY`, optional `GROQ_API_KEY`, and `VOICE_TRANSCRIPTION_ENABLED` as runtime settings/secrets as appropriate.
4. Configure the Cloud Run service to require application-level Supabase authentication exactly as it does today. Do not put IAM-only authentication in front of a public browser app unless the browser sign-in flow is intentionally redesigned.
5. Confirm Supabase Auth Site URL and redirect allowlists for the new test hostname before testing sign-in/password recovery. Do not change production redirects during this proof.
6. Test protected admin/AAL2 checks, cookie refresh, password recovery, chat stream completion/cancellation, Tavily search, image input, and transcription against a test service with redacted logs.
7. Set explicit request timeout, concurrency, max instances, memory, and budget alerts. Start with a conservative concurrency setting and tune from measurements.
8. Keep the existing Cloudflare deployment as rollback until the test suite and acceptance checklist pass.

## Cost and billing cautions

Cloud Run has a usage-based free tier, but free allowance is not the same as guaranteed zero cost. Region, CPU/memory allocation, request volume, egress, build service, and Artifact Registry storage can add costs. Confirm whether the Google Cloud project requires a billing account/payment method and check the selected region's pricing before provisioning. Do not create a project or enable billing as part of this PR.

## Remaining gates

- [ ] CI unit tests, lint, typecheck, existing Cloudflare build, and Docker image build pass.
- [ ] Inspect the built container locally or in CI and verify it starts and serves the health endpoint.
- [ ] Run a non-production Cloud Run deployment only after the owner explicitly approves project, region, billing, and secrets setup.
- [ ] Verify Supabase session/cookie behavior and the core authenticated endpoints in the test deployment.
- [ ] Record actual response latency, time-to-first-token, provider latency, error classes, request sizes, and cost observations.
- [ ] Make the final runtime decision after this evidence; no production migration is implied by this compatibility PR.

## Official documentation reviewed

- Cloud Run pricing and free tier: https://cloud.google.com/run/pricing
- Cloud Run request timeout: https://docs.cloud.google.com/run/docs/configuring/request-timeout
- Cloud Run quotas and request limits: https://docs.cloud.google.com/run/quotas
- Cloud Run functions quotas: https://docs.cloud.google.com/functions/quotas
