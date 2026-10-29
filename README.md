# Brilina Forge AI

A streaming AI assistant built with Next.js, the AI SDK, and shadcn components. Vercel is the primary production application runtime; the existing Cloudflare Worker remains available as a fallback, and Cloudflare Workers AI is called over HTTPS for configured model tasks.

## AI, search, and voice input

- **Writing models:** The selector includes Cloudflare Workers AI models intended for the Workers Free plan: GLM 4.7 Flash, GPT OSS 120B, Gemma 4 26B, and NVIDIA Nemotron 3 120B. Gemini 2.5 Flash and Gemini 2.5 Flash-Lite are added when `GOOGLE_GENERATIVE_AI_API_KEY` is configured. Provider free-tier quotas and availability still apply; Cloudflare reserves some larger models for paid billing.
- **Conversation titles:** A separate internal Gemma model generates concise titles and is deliberately hidden from the user-facing model selector. It uses the existing Cloudflare Workers AI credentials.
- **Image understanding:** Optional vision models are Cloudflare Workers AI `@cf/qwen/qwen3.8-27b` and Groq `qwen/qwen3.8-27b`. Groq's `meta-models/muse-spark-open` is a limited preview and is shown only when explicitly configured. The app accepts PNG/JPEG/WebP images up to 1 MiB each and 3 MiB total. The Cloudflare vision route is limited to one image per request; Groq Qwen is limited to three. These are application limits unless a stricter provider limit applies.
- **Web search:** Tavily's independent search API. The server bounds response bodies, retries one transient failure within the timeout budget, deduplicates normalized HTTPS source URLs, truncates excerpts, marks partial results, and returns safe errors.
- **Voice input:** Authenticated users receive a server-created recording session before the browser records audio. The server enforces a maximum 10-minute session, and the browser automatically stops and transcribes at the limit. Stop inserts the transcript without sending; Send transcribes and sends through the existing chat flow; X cancels. No recording timer is displayed. Failed audio can be retried once during the current page session.
- **Citations:** The assistant is instructed to cite web-supported claims with Markdown links to the exact URLs returned by Tavily.
- **GitHub coding agent:** When GitHub is connected and repositories are allowlisted, chat can inspect code, work on `forge/*` branches, create commits, open PRs, and inspect CI. The agent cannot merge PRs or dispatch workflows; see [GitHub agent setup and safety](docs/GITHUB_AGENT.md). Its additive database migration requires separate approval before applying to any live environment.
- **Existing UI:** The responsive chat UI, streamed messages, model selector, GitHub repository lookup, and interactive question tool are retained.

Provider credentials are server-side only. Do not prefix them with `NEXT_PUBLIC_` or commit real values. Vision models appear in the selector only when their required server-side credentials are configured.

## Environment variables

Copy `.env.example` to `.env.local` for local development. Create a Supabase project, apply the SQL migrations in `supabase/migrations/`, disable public sign-up, and follow [the authentication and email setup guide](docs/architecture/AUTH_AND_EMAIL_SETUP.md). The owner account and its trusted app_metadata role marker must be bootstrapped manually in Supabase before the admin screen can be used.

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL (public; needed at build time and runtime) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes | Supabase publishable key (public; needed at build time) |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes, server only | Privileged server-side operations; never expose to the browser |
| `GITHUB_TOKEN_ENCRYPTION_KEY` | Optional | Dedicated key for encrypting stored GitHub tokens; otherwise derived from the service-role key |
| `GITHUB_OAUTH_CLIENT_ID` / `GITHUB_OAUTH_CLIENT_SECRET` | Optional | Enables GitHub OAuth connection; personal access token setup works without OAuth |
| `GITHUB_AGENT_MAX_STEPS` | Optional | GitHub coding-agent step cap, default 20 and maximum 40 |
| `GITHUB_AGENT_ALLOW_WORKFLOW_EDITS` | Optional, default false | Allows editing repository workflow files; agent still cannot dispatch workflows |
| `CLOUDFLARE_ACCOUNT_ID` | Yes | Cloudflare account ID used for Workers AI requests |
| `CLOUDFLARE_AI_API_TOKEN` | Yes | Cloudflare API token with permission to call Workers AI |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Optional | Adds Gemini 2.5 Flash and Gemini 2.5 Flash-Lite to the writing-model selector; server-side only |
| `TAVILY_API_KEY` | For web search | Tavily API key |
| `REDIS_URL` | Optional, for stream recovery | Layerbase Cloud Redis TLS URL (`rediss://...`); server-side only. See `docs/LAYERBASE_STREAM_RECOVERY.md`. |
| `GROQ_API_KEY` | Optional | Enables the Groq Qwen vision model; keep server-side only |
| `GROQ_VISION_SECONDARY_MODEL` | Optional, preview access only | Set to `meta-models/muse-spark-open` only if the Groq account is approved for this preview model |
| `VOICE_TRANSCRIPTION_ENABLED` | Explicit opt-in | Set to `true` to enable transcription; authenticated users only, with a 10-minute browser recording limit and automatic transcription at the limit |
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

## Vercel deployment

Vercel is the primary production application runtime. The repository's Git integration deploys the production branch to Vercel and can create preview deployments for pull requests. Configure environment variables in the Vercel project settings; never commit secrets.

1. Use Node.js 22 and pnpm 10.
2. Set the production branch to `main` and confirm the GitHub repository connection.
3. Configure `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for build and runtime.
4. Configure `SUPABASE_SERVICE_ROLE_KEY`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_AI_API_TOKEN`, `TAVILY_API_KEY`, and any enabled `GROQ_API_KEY` / `GEMINI_API_KEY` as server-side environment variables. Never prefix server secrets with `NEXT_PUBLIC_`.
5. Set `VOICE_TRANSCRIPTION_ENABLED=true` only when authenticated transcription is intended to be available.
6. For refresh-resistant streaming, create a Layerbase Redis database and set its TLS connection URL as `REDIS_URL`; follow `docs/LAYERBASE_STREAM_RECOVERY.md`. Without this variable, ordinary chat works but stream recovery is disabled.
6. After a preview deployment, test `/api/health`, authenticated chat streaming, Tavily search, voice transcription, conversation history, private file access, and document/image workflows with an authorized test account.

**Vercel payload caution:** Vercel Functions document a 4.5 MB request/response payload limit. Application-level 10 MiB file and 20 MiB audio limits do not guarantee that these binary uploads can be proxied through Vercel routes. Use the verified authenticated private Supabase Storage upload flow for large files/audio, and pass compact file references to processing routes. Do not assume an oversized request reaches route-level validation.

The Cloudflare Worker configuration is intentionally retained as a fallback. `pnpm build:worker`, `pnpm preview`, and `pnpm deploy` are legacy Worker scripts; use them only to verify or intentionally deploy that fallback, not as the primary Vercel deployment command. No production DNS change or Cloudflare decommissioning is implied.

Scripts:

- `pnpm test` — unit and contract tests.
- `pnpm lint` — ESLint.
- `pnpm typecheck` — TypeScript checks.
- `pnpm build` — native Next.js production build used by Vercel.
- `pnpm build:worker` — separate OpenNext Cloudflare Worker build.
- `pnpm preview` — preview the Worker build.
- `pnpm deploy` — intentionally deploy through Wrangler; do not use for normal production release.

## CI

GitHub Actions runs unit/contract tests, lint, type checking, the native Next.js production build, the retained Cloudflare Worker build, and a Docker compatibility build on pushes to `main` and pull requests. The Vercel Git integration has its own deployment status; CI success and deployment status do not replace live authenticated workflow acceptance.

## Security notes

The chat and transcription endpoints require a server-verified Supabase session and a fresh, non-disabled user_access row. The owner admin page and every admin API require the trusted owner marker and server-verified AAL2. Voice recording uses a server-created session with server timestamps, a 10-minute maximum, automatic stop/transcription at the limit, and no visible frontend timer. Upload size and session attempts are bounded; audio is not durably stored. The public Brilina Dev landing page and invite-only Forge workspace/domain separation are described in `docs/IMPLEMENTATION_SPEC.md`. The search tool treats retrieved webpage text as untrusted and limits the amount of data passed to the model.

## Implementation and planning documents

[docs/IMPLEMENTATION_SPEC.md](docs/IMPLEMENTATION_SPEC.md) contains product and stage requirements for authentication, persistence, file handling, and related app features. Its stage descriptions are requirements, not a live progress tracker. [docs/NEXT_PHASE_PLAN.md](docs/NEXT_PHASE_PLAN.md) is the current plan for the CPU/reliability investigation, possible external compute, incremental workload migration, and Agent Workflow System. [docs/SECURE-APPLICATION-DIAGNOSTICS.md](docs/SECURE-APPLICATION-DIAGNOSTICS.md) documents the diagnostic sink and its distinction from native Cloudflare logs. Historical pipeline recovery notes are retained in the AI pipeline documents; verify current source and live evidence before relying on old status statements. The future invited-user quota design is documented in [docs/architecture/INVITED_USER_LIMITS.md](docs/architecture/INVITED_USER_LIMITS.md); that file is documentation-only. The older [docs/REUSABLE-FOUNDATION-PLAN.md](docs/REUSABLE-FOUNDATION-PLAN.md) remains as a historical repository audit. Its Better Auth, Neon, and R2 recommendations are superseded by the current implementation specification.
