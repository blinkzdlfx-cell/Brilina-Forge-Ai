# Brilina Forge AI

A streaming AI assistant built with Next.js, the AI SDK, and shadcn components. The app is configured to run on Cloudflare Workers using the OpenNext Cloudflare adapter.

## AI, search, and voice input

- **Chat model:** Cloudflare Workers AI `@cf/zai-org/glm-4.7-flash`, accessed through Cloudflare's OpenAI-compatible endpoint.
- **Web search:** Tavily's independent search API. The server requests at most five results, only accepts HTTPS result URLs, truncates excerpts, applies a timeout, and returns safe errors for provider failures.
- **Voice input:** The browser records a short audio clip and uploads it to `POST /api/transcribe`. The server sends the audio to OpenAI's `whisper-1` transcription API and inserts the returned text into the composer for review. Voice input requires the server-side `OPENAI_API_KEY` secret.
- **Citations:** The assistant is instructed to cite web-supported claims with Markdown links to the exact URLs returned by Tavily.
- **Existing UI:** The responsive chat UI, streamed messages, model selector, GitHub repository lookup, and interactive question tool are retained.

Provider credentials are server-side only. Do not prefix them with `NEXT_PUBLIC_` or commit real values.

## Environment variables

Copy `.env.example` to `.env.local` for local development.

| Variable | Required | Purpose |
| --- | --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | Yes | Cloudflare account ID used in the Workers AI API URL |
| `CLOUDFLARE_AI_API_TOKEN` | Yes | Cloudflare API token with permission to call Workers AI |
| `TAVILY_API_KEY` | For web search | Tavily API key |
| `OPENAI_API_KEY` | For voice transcription | OpenAI API key for the Whisper transcription endpoint |
| `NEXTJS_ENV` | Local development | OpenNext environment mode |

The `GET /api/health` endpoint reports whether the AI and search credentials are configured. It never returns their values.

## Local development

Use Node.js 22 or newer and pnpm 10.

```bash
pnpm install --no-frozen-lockfile
cp .env.example .env.local
# Fill in the credentials in .env.local
pnpm dev
```

Voice input requires microphone permission and a secure context (HTTPS; localhost is accepted for local development). Recordings are uploaded to the application's server endpoint and then sent to OpenAI for transcription. The application does not intentionally store recordings or transcripts. The endpoint limits uploads to 20 MB; OpenAI usage charges may apply.

## Cloudflare Workers deployment

The repository includes `wrangler.jsonc` and `open-next.config.ts`. OpenNext converts the Next.js build output into a Worker. The Worker name is `brilina-forge-ai`.

1. Connect this repository to Cloudflare Workers Builds, with `main` as the production branch.
2. Use Node.js 22 and pnpm 10 for the build environment.
3. Set the install command to `pnpm install --no-frozen-lockfile` for the first build. GitHub Actions refreshes and commits `pnpm-lock.yaml` after the checks pass; subsequent builds can use frozen-lockfile installs.
4. Set the build command to `pnpm build:worker` for a build-only check. The separate `pnpm deploy` command deploys using Wrangler credentials and should only be used when intentionally deploying through Wrangler.
5. Add `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_AI_API_TOKEN`, `TAVILY_API_KEY`, and `OPENAI_API_KEY` as encrypted Worker secrets/environment variables in Cloudflare. Do not put secrets in `wrangler.jsonc`.
6. After deployment, open `/api/health`. Test a current-events question and confirm that the response includes source links. Test voice input separately after setting `OPENAI_API_KEY`.

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

The chat endpoint is currently unauthenticated, so anyone who can reach it may consume Workers AI and Tavily quota. Add rate limiting and authentication before making the app broadly public. The transcription endpoint does not expose the OpenAI key, rejects unsupported/oversized files, and returns generic upstream errors; authentication and rate limiting should be added before broad public use. The search tool treats retrieved webpage text as untrusted and limits the amount of data passed to the model.

## Reusable foundation plan

See [docs/REUSABLE-FOUNDATION-PLAN.md](docs/REUSABLE-FOUNDATION-PLAN.md) for the architecture audit, authentication decision, modularization plan, and starter-template acceptance criteria.
