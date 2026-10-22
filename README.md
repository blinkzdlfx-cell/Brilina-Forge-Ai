# Brilina Forge AI

A streaming AI assistant built with Next.js, the AI SDK, and shadcn components. The app is configured to run on Cloudflare Workers using the OpenNext Cloudflare adapter.

## AI, search, and voice input

- **Chat model:** Cloudflare Workers AI `@cf/zai-org/glm-4.7-flash`, accessed through Cloudflare's OpenAI-compatible endpoint. Responses stream through the AI SDK; request bytes, recent context, model output, and tool steps are bounded.
- **Image understanding:** Optional vision models are Cloudflare Workers AI `@cf/qwen/qwen3.8-27b` and Groq `qwen/qwen3.8-27b`. Groq's `meta-models/muse-spark-open` is a limited preview and is shown only when explicitly configured. The app accepts PNG/JPEG/WebP images up to 1 MiB each and 3 MiB total. The Cloudflare vision route is limited to one image per request; Groq Qwen is limited to three. These are application limits unless a stricter provider limit applies.
- **Web search:** Tavily's independent search API. The server bounds response bodies, retries one transient failure within the timeout budget, deduplicates normalized HTTPS source URLs, truncates excerpts, marks partial results, and returns safe errors.
- **Voice input:** The browser records audio and sends raw audio bytes to `POST /api/transcribe`. Cloudflare Workers AI's `@cf/openai/whisper-large-v3-turbo` transcribes it through the `AI` binding. Stop transcribes and inserts text without sending; Send transcribes and sends through the existing chat flow; X cancels. Failed audio can be retried during the current page session.
- **Citations:** The assistant is instructed to cite web-supported claims with Markdown links to the exact URLs returned by Tavily.
- **Existing UI:** The responsive chat UI, streamed messages, model selector, GitHub repository lookup, and interactive question tool are retained.

Provider credentials are server-side only. Do not prefix them with `NEXT_PUBLIC_` or commit real values. Vision models appear in the selector only when their required server-side credentials are configured.

## Environment variables

Copy `.env.example` to `.env.local` for local development.

| Variable | Required | Purpose |
| --- | --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | Yes | Cloudflare account ID used for Workers AI requests |
| `CLOUDFLARE_AI_API_TOKEN` | Yes | Cloudflare API token with permission to call Workers AI |
| `TAVILY_API_KEY` | For web search | Tavily API key |
| `GROQ_API_KEY` | Optional | Enables the Groq Qwen vision model; keep server-side only |
| `GROQ_VISION_SECONDARY_MODEL` | Optional, preview access only | Set to `meta-models/muse-spark-open` only if the Groq account is approved for this preview model |
| `VOICE_TRANSCRIPTION_ENABLED` | Explicit opt-in | Set to `true` to enable transcription; authenticated users only, with a 15-minute browser recording limit and automatic transcription at the limit |
| `NEXTJS_ENV` | Local development | OpenNext environment mode |

The `GET /api/health` endpoint reports whether the AI and search credentials are configured. It never returns their values.

## Local development

Use Node.js 22 or newer and pnpm 10.

```bash
pnpm install --no-frozen-lockfile
cp .env.example .env.local
# Fill in the credentials in .env.local
# Set VOICE_TRANSCRIPTION_ENABLED=true locally to test the microphone
pnpm dev
```

Voice input requires microphone permission and a secure context (HTTPS; localhost is accepted for local development). Recordings are uploaded to the application's server endpoint and transcribed by Cloudflare Workers AI. Failed audio is retained in page memory for retry during the current session; durable server-side audio storage is planned separately and is not yet implemented. The endpoint limits uploads to 20 MB and transcription attempts time out after 45 seconds. Workers AI usage is subject to Cloudflare's current allocation and applicable plan pricing.

## Cloudflare Workers deployment

The repository includes `wrangler.jsonc` and `open-next.config.ts`. OpenNext converts the Next.js build output into a Worker. The Worker name is `brilina-forge-ai`.

1. Connect this repository to Cloudflare Workers Builds, with `main` as the production branch.
2. Use Node.js 22 and pnpm 10 for the build environment.
3. Set the install command to `pnpm install --no-frozen-lockfile` for the first build. GitHub Actions refreshes and commits `pnpm-lock.yaml` after the checks pass; subsequent builds can use frozen-lockfile installs.
4. Set the build command to `pnpm build:worker` for a build-only check. The separate `pnpm deploy` command deploys using Wrangler credentials and should only be used when intentionally deploying through Wrangler.
5. Add `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_AI_API_TOKEN`, and `TAVILY_API_KEY` as encrypted Worker secrets/environment variables in Cloudflare. Do not put secrets in `wrangler.jsonc`.
6. Voice transcription requires an authenticated, eligible user. The feature flag is an operational kill switch; keep it unset or false when transcription should be disabled. The maximum recording duration is 15 minutes, enforced server-side with automatic transcription at the limit; no recording timer is displayed in the frontend.
7. After deployment, open `/api/health`. Test a current-events question and confirm that the response includes source links. Test voice input separately after enabling it safely.

Scripts:

- `pnpm test` — unit tests.
- `pnpm lint` — ESLint.
- `pnpm typecheck` — TypeScript checks.
- `pnpm build:worker` — Next.js production build and OpenNext Cloudflare adaptation.
- `pnpm preview` — Build and preview in the Workers runtime.
- `pnpm deploy` — Build and deploy through Wrangler.

## CI

GitHub Actions runs unit tests, lint, type checking, and the Cloudflare Worker build on pushes to `main` and pull requests. It installs with `pnpm install --no-frozen-lockfile` so it can refresh the lockfile after dependency changes. On successful pushes to `main`, it commits a changed lockfile so Cloudflare can subsequently use frozen-lockfile installs.

## Security notes

The chat and transcription endpoints are currently unauthenticated in the existing baseline; Stage 3 must protect both with verified sessions and access-state checks. Voice recording is limited to 15 minutes by a server-controlled recording session, with automatic transcription at the limit and no visible frontend timer. The current upload-after-stop flow may need a bounded chunk/session protocol to support reliable server-side auto-finalization. The server must enforce duration/size bounds and safe errors. The planned public Brilina Dev landing page and invite-only Forge workspace/domain separation are described in `docs/IMPLEMENTATION_SPEC.md`. The search tool treats retrieved webpage text as untrusted and limits the amount of data passed to the model.

## Implementation specification

The current planning baseline is [docs/IMPLEMENTATION_SPEC.md](docs/IMPLEMENTATION_SPEC.md). It defines the staged Supabase database, owner-managed authentication, conversation persistence, the Agent Workflow System, private file storage, vision, PDF/document processing, and verification requirements. The specification now has eleven stages grouped into four implementation batches; the Agent Workflow System is Stage 5 and is assigned to Batch 4 as requested. The future invited-user quota design is documented in [docs/architecture/INVITED_USER_LIMITS.md](docs/architecture/INVITED_USER_LIMITS.md); that file is documentation-only. The older [docs/REUSABLE-FOUNDATION-PLAN.md](docs/REUSABLE-FOUNDATION-PLAN.md) remains as a historical repository audit. Its Better Auth, Neon, and R2 recommendations are superseded by the current implementation specification.
