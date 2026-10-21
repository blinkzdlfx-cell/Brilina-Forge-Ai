# Brilina Forge AI

A streaming AI assistant built with Next.js, the AI SDK, and shadcn components. The app is configured to run on Cloudflare Workers using the OpenNext Cloudflare adapter.

## AI, search, and voice input

- **Chat model:** Cloudflare Workers AI `@cf/zai-org/glm-4.7-flash`, accessed through Cloudflare's OpenAI-compatible endpoint.
- **Web search:** Tavily's independent search API. The server requests at most five results, only accepts HTTPS result URLs, truncates excerpts, applies a timeout, and returns safe errors for provider failures.
- **Voice input:** The browser records audio and sends raw audio bytes to `POST /api/transcribe`. Cloudflare Workers AI's `@cf/openai/whisper-large-v3-turbo` transcribes it through the `AI` binding. Stop transcribes and inserts text without sending; Send transcribes and sends through the existing chat flow; X cancels. Failed audio can be retried during the current page session.
- **Citations:** The assistant is instructed to cite web-supported claims with Markdown links to the exact URLs returned by Tavily.
- **Existing UI:** The responsive chat UI, streamed messages, model selector, GitHub repository lookup, and interactive question tool are retained.

Provider credentials are server-side only. Do not prefix them with `NEXT_PUBLIC_` or commit real values.

## Environment variables

Copy `.env.example` to `.env.local` for local development.

| Variable | Required | Purpose |
| --- | --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | Yes | Cloudflare account ID used for Workers AI requests |
| `CLOUDFLARE_AI_API_TOKEN` | Yes | Cloudflare API token with permission to call Workers AI |
| `TAVILY_API_KEY` | For web search | Tavily API key |
| `VOICE_TRANSCRIPTION_ENABLED` | Explicit opt-in | Set to `true` to enable transcription; keep off on public deployments until authentication and rate limiting are in place |
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
6. Keep `VOICE_TRANSCRIPTION_ENABLED` unset or false on the public Worker until authentication and rate limiting are implemented. For local development, set it to `true`.
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

The chat endpoint is currently unauthenticated, so anyone who can reach it may consume Workers AI and Tavily quota. The transcription endpoint is explicitly disabled unless `VOICE_TRANSCRIPTION_ENABLED=true`, rejects unsupported/oversized files, and returns generic upstream errors. Keep it disabled on public deployments until authentication and rate limiting are in place. The search tool treats retrieved webpage text as untrusted and limits the amount of data passed to the model.

## Reusable foundation plan

See [docs/REUSABLE-FOUNDATION-PLAN.md](docs/REUSABLE-FOUNDATION-PLAN.md) for the architecture audit, authentication decision, modularization plan, starter-template acceptance criteria, and the future server-side failed-audio retention design.
