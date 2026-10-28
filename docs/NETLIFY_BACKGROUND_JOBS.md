# Netlify background jobs

Brilina Forge keeps normal chat on the existing Vercel request/stream path. Background mode is an explicit composer option and stores job state and progress events in Supabase. Netlify Background Functions do not stream a response to the browser; the browser polls the authenticated job endpoint and can recover after refresh.

## Current capability boundary

The worker uses the application's selected AI model when that provider is configured, including Cloudflare Workers AI, Google Gemini, and Groq vision models. At present, the in-app GitHub tool exposes public repository statistics; it is not a full code-editing, test-running, or merge tool. The worker must not claim that it changed files, ran tests, or merged a pull request unless those capabilities are separately implemented and actually invoked. This background job foundation is not a substitute for a sandboxed coding agent.

## Setup

1. The two migrations (`20261028171440_background_jobs.sql` and `20261028171459_background_job_query_indexes.sql`) have already been applied to the current Brilina Forge Supabase project. For a different project, apply both in timestamp order; do not reapply them to the current project.
2. Deploy this repository as a Netlify site so Netlify builds the function in `netlify/functions/process-forge-job.mts`. The function endpoint path is `/process-forge-job`.
3. In Netlify environment variables, set:
   - `NETLIFY_WORKER_SECRET`: a long, random server-only secret.
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `CLOUDFLARE_ACCOUNT_ID`
   - `CLOUDFLARE_AI_API_TOKEN`
   - `TAVILY_API_KEY` if web search is enabled for background tasks.
   - `GROQ_API_KEY` if a selected vision model is needed.
   - `GOOGLE_GENERATIVE_AI_API_KEY` if Google Gemini models are enabled.
4. In Vercel environment variables, set the same `NETLIFY_WORKER_SECRET` and `NETLIFY_BACKGROUND_FUNCTION_URL` to the full Netlify function URL, for example `https://YOUR-NETLIFY-SITE.netlify.app/process-forge-job`.
5. Redeploy both services after adding environment variables.
6. From Brilina Forge, send a text-only prompt with **Background task** enabled. The browser should show a durable status panel; refresh the page while the task runs to verify recovery.

## Limits and safety

- Netlify Background Functions have a documented maximum execution time of 15 minutes. The worker uses a 9-minute AI execution budget to leave time for saving results.
- Background invocation payloads are limited, so the browser sends only a job identifier to Netlify. The prompt is loaded from Supabase by the worker.
- The worker secret and Supabase service-role key must never be exposed to the browser or committed to Git.
- Supabase is the durable source of truth. Redis is not required for background-job status.
- Netlify's Free plan has a monthly credit hard limit. Check usage in the Netlify dashboard and do not enable paid auto-recharge.
- Worker setup is not complete until the migration is applied, both deployments succeed, environment variables are configured, and an end-to-end task succeeds.
