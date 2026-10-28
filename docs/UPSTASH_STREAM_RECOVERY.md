# Upstash Redis for Brilina Forge AI stream recovery

## Purpose

Redis stores short-lived resumable stream data and a stop-request flag. Supabase remains the source of truth for conversation messages and records the active stream ID. Redis must not become the only copy of a completed response.

## Setup

1. Create one regional Redis database in the Upstash console.
2. Keep it on the Free plan. Do not add a payment method unless the owner deliberately approves a paid migration.
3. Copy the database's TLS connection URL into the Vercel project as the server-only environment variable `REDIS_URL`. Do not use a `NEXT_PUBLIC_` variable and do not commit the URL.
4. Redeploy the Vercel deployment after adding the variable.
5. Verify that a test response can be resumed after refreshing the chat page and that Stop ends generation.
6. Do not add `REDIS_URL` to the Cloudflare Worker environment unless that runtime is separately verified for the Redis TCP client. The native Vercel/Node.js deployment is the initial supported Redis runtime.

## Free-tier management

- The published Free tier currently lists 256 MB data, 10 GB monthly bandwidth, and 500,000 commands/month; the free database also has a 10,000-requests/day cap. Exceeding the free request cap causes commands to fail rather than silently upgrading.
- Use one database for stream recovery only. Do not copy full conversation history or uploaded files into Redis.
- Use short-lived stream retention (target: 1 hour or less) and remove stop flags after they expire. Supabase remains the durable transcript store.
- Review command usage, storage, bandwidth, and error rate weekly during testing; inspect usage more frequently if streams are left open for long periods.
- Do not add a payment method to “solve” a quota issue. Upstash documents that adding one switches free resources on the account to pay-as-you-go. Stop testing and review usage first.
- If the free database is archived after inactivity, restore it in the Upstash console and confirm the credentials before expecting stream resume to work.
- If Redis is unavailable or not configured, ordinary chat should still work, but refresh-resume is unavailable and the UI must not claim the stream is resumable.

## Operations

- Never place Redis credentials in client code, logs, source control, or diagnostics.
- Use Redis only for transient stream replay and cancellation flags. Persist user/assistant message content and final state in Supabase.
- A stopped or completed stream must clear the active stream reference in Supabase. Old Redis stream data should expire automatically.
- Do not raise Upstash limits or switch billing tiers without explicit owner approval.

References: Upstash Redis pricing and limits, Upstash Redis FAQ, and the AI SDK chatbot resume-streams documentation.
