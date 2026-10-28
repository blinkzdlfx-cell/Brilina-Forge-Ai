# Layerbase Redis for Brilina Forge AI stream recovery

## Purpose

Layerbase Redis stores short-lived resumable stream data and stop-request flags. Supabase remains the source of truth for conversation messages and records the active stream ID. Redis must not become the only copy of a completed response.

## Provider and free tier

Use **Layerbase Cloud Redis** (not Upstash) for this integration. The current Layerbase Free tier advertises $0/month with no card, two databases, 5 GB storage, and up to 20 concurrent connections. Free databases hibernate after 15 minutes idle; the first request after sleep can take roughly 1–5 seconds to wake. A database left hibernated may later be archived and require manual restore. Check the current official pricing and connection docs before changing plans.

Official references:
- https://layerbase.com/db/redis
- https://layerbase.com/pricing
- https://layerbase.com/docs/cloud/connecting/redis
- https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-resume-streams

## Setup

1. Create one Redis database in Layerbase Cloud on the Free plan.
2. In its Connect panel, copy the **TLS Redis connection URL** (the `rediss://...` URL, not the REST URL/token).
3. Add it to the Vercel project's server-side environment variables as `REDIS_URL`. Do not use a `NEXT_PUBLIC_` variable and never commit the URL.
4. Redeploy the Vercel deployment after adding the variable.
5. Apply `supabase/migrations/202610280001_durable_chat_streams.sql` before testing the new conversation persistence/versioning.
6. Verify authenticated chat streaming, refresh-and-resume, explicit Stop, and recovery after a database idle period.
7. Keep this connection on the Node.js/Vercel runtime. Do not add it to the Cloudflare Worker environment unless that runtime is separately verified for this Redis TCP client.

### Important Layerbase connection detail

Layerbase routes its shared TLS port by the database hostname supplied through TLS SNI. The code explicitly sets the hostname as `socket.servername` for the standard Redis client and the resumable-stream publisher/subscriber. A bare `rediss://` URL without SNI can hang or fail to connect.

Use the native TLS Redis connection string for stream recovery. The Layerbase Upstash-compatible REST endpoint is useful for HTTP-only runtimes, but resumable-stream requires Redis Pub/Sub; do not substitute the REST URL for this connection without implementing and testing a compatible publisher/subscriber adapter.

## Free-tier management

- Use Redis for transient stream replay and stop flags only. Do not copy conversation history or uploaded files into Redis.
- Keep resumable stream retention short (target: one hour or less where supported) and let stop flags expire automatically. Supabase remains the durable transcript store.
- The Free tier has a 20 concurrent connection cap. The app uses Redis connections for stream Pub/Sub plus stop/polling operations; treat this as suitable for low-volume testing, not a guarantee for high concurrent traffic.
- The database hibernates after 15 minutes without connections, so expect a cold-start delay after inactivity. Keep the user experience able to retry and keep ordinary chat functional if Redis is unavailable.
- Review database health, connections, storage, and errors during testing. Do not upgrade to a paid plan unless the owner explicitly approves.
- Keep credentials out of client code, logs, source control, and diagnostics.
- If Redis is unavailable or not configured, ordinary chat should still work, but refresh-resume is unavailable and the UI must not claim the stream is resumable.

## Operational expectations

- Supabase owns the durable conversation transcript, user/assistant messages, response versions, and active stream reference.
- A stopped or completed stream should clear its active stream reference in Supabase. Redis should hold only transient replay state.
- Before declaring the feature production-ready, test refresh during a response, switch conversations during a response, stop a response, reopen a conversation, and regenerate/select response versions.
