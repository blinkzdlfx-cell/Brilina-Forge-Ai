# Brilina Forge AI — Repository Implementation Specification

**Repository:** `blinkzdlfx-cell/Brilina-Forge-Ai`  
**Target application branch:** `main`  
**Specification branch:** `docs/owner-managed-auth-spec`  
**Runtime:** Next.js 16, React 19, AI SDK, OpenNext on Cloudflare Workers  
**Status:** Planning only. No application implementation is authorized by this document.  
**Execution rule:** Implement the ten numbered stages in their specified order, grouped into four batches. Add/update tests alongside implementation, but run the consolidated full test suite after all four batches are complete, as requested. Do not skip a stage or start GitHub integration early. If a critical design blocker appears, stop and report it rather than silently changing scope.

This document is the current source of truth for the planned backend, authentication, persistence, and file-handling work. It supersedes conflicting earlier recommendations in `docs/REUSABLE-FOUNDATION-PLAN.md` concerning Better Auth, Neon, Cloudflare R2, and sign-in methods. Keep that file's useful repository-audit observations, but do not follow its superseded provider decisions.

## 1. Goals and fixed decisions

- Personal project; prioritize free tiers and handle quotas, pauses, and provider failures clearly.
- Keep the existing React/Next.js UI and integrate with it. Do not rebuild the application.
- Keep text generation on Cloudflare Workers AI.
- Use Supabase for PostgreSQL, Auth, and private Storage. This is a fresh setup: there is no existing database, storage, authentication, or user data to migrate.
- Use an external hosted vision provider, starting with Groq if its model availability and free limits fit.
- Use a document-capable external provider for PDFs, with Gemini as the initial candidate if its free allocation and limits fit.
- Keep Tavily, retaining its existing protections and adding a 4,000-character aggregate excerpt budget.
- Do not add image generation.
- Upload files to Supabase Storage and pass authorized file references through chat requests. Never put file base64 data in chat requests.
- Resize and compress images in the browser before upload.
- Use private buckets, access policies, and short-lived signed URLs where provider access requires them. Never use permanent public URLs for private files.
- Keep the Supabase service-role key and all provider secrets server-side.
- Do not implement GitHub integration in this phase. Keep core database tables general so later integrations can add separate tables without changing the core schema. Preserve existing UI and features unless a stage explicitly changes their behavior.
- No public sign-up, invitation codes, or invite links. The owner creates accounts from the owner-only admin screen.
- No code implementation begins until the owner approves this specification.

## 2. Repository baseline inspected

The current `main` branch contains:

- `app/api/chat/route.ts`: AI SDK streaming chat endpoint, bounded request/context handling, model selection, image validation, and tool execution.
- `app/api/transcribe/route.ts`: audio upload validation and Cloudflare Workers AI Whisper transcription.
- `app/api/health/route.ts`: sanitized provider-configuration health response.
- `lib/tavily-search.mjs`: Tavily request, response-body, retry, URL, excerpt, and result-count safeguards.
- `tests/tavily-search.test.mjs`: existing unit tests for Tavily validation, bounds, retries, safe errors, deduplication, and cancellation.
- `tools/web_search.ts`: Tavily AI SDK tool; search currently runs inside chat rather than through a separate `/api/search` route.
- `lib/models.ts`: Cloudflare text model and optional vision model configuration.
- `lib/runtime-env.ts`: Cloudflare binding lookup with local environment fallback.
- `components/chat.tsx`: temporary client-side chat state and message submission.
- `components/prompt-form.tsx`: existing image-selection, preview/removal, voice recording, and transcription UI.
- `components/chat-sidebar.tsx`: current sidebar displays the current conversation but does not load durable history.
- `wrangler.jsonc`: OpenNext Worker configuration and AI binding.
- `.env.example`, `package.json`, and `README.md`: configuration, scripts, and setup guidance.
- CI runs tests, lint, TypeScript checking, and the Worker build.

Current constraints and cautions:

1. Chats exist only in client memory and disappear on refresh.
2. There is no database, auth, or storage integration yet.
3. Chat and transcription endpoints are currently unauthenticated. Stage 3 must protect both endpoints and all private application APIs with a verified, non-disabled session.
4. `wrangler.jsonc` currently sets `VOICE_TRANSCRIPTION_ENABLED` to true, while older README guidance says to disable public transcription. The agreed decision is to require authentication for transcription. Stage 3 must reconcile the README and deployment configuration, preserve the feature flag, enforce session/access checks, and retain bounded audio size/duration, request timeouts, and safe errors.
5. The chat composer currently sends selected images as file parts in the chat request. Stage 5–7 replace that flow with upload-first file references.
6. Tavily already limits results to five, truncates each excerpt to 1,200 characters, limits the response body to 128 KiB, removes duplicate normalized HTTPS URLs, retries one bounded transient failure, and reports partial results. Preserve these protections.
7. There is no standalone search API route at present. The web-search tool executes as part of the protected chat request. If a separate search route is added later, it must use the same authentication and access checks.

## 3. Target architecture

- **Frontend:** existing Next.js/React chat UI and shadcn-style components.
- **Application gateway:** Cloudflare Workers via OpenNext.
- **Text generation:** Cloudflare Workers AI.
- **Search:** Tavily, with strict response and aggregate-context budgets.
- **Vision:** external hosted provider, initially Groq if suitable.
- **Documents:** external document-capable provider, initially Gemini if suitable.
- **Database:** Supabase PostgreSQL.
- **Identity and sessions:** Supabase Auth.
- **Files:** private Supabase Storage bucket.
- **Scheduled activity check:** Cloudflare Cron Trigger calling a lightweight Supabase endpoint/query.
- **No R2, no Neon, and no image-generation provider.**

Normal text messages should stay on Cloudflare Workers AI. Vision and document operations are routed to their dedicated provider; the Worker authenticates the user, verifies file ownership, routes the request, and streams/returns the result. Tavily output is bounded before it is included in the model context.

Use server-side provider modules so the chat route does not accumulate provider-specific parsing and error-handling logic. Do not assume an external provider can access a private Supabase object directly; select between short-lived signed access and provider-side file upload based on the provider's supported API. Signed URLs must expire and must not be persisted as durable file identifiers.

## 4. Security and access model

### 4.1 User types and account creation

- Public sign-up is disabled in Supabase Auth settings and there is no public sign-up UI or route.
- The owner account is created manually in the Supabase dashboard and marked with a trusted owner marker in Supabase `app_metadata`, for example `app_metadata.role = "owner"`. Never use user-editable `user_metadata` for roles or authorization.
- All other accounts are created only by the owner through `/admin`.
- There are no invitation codes, invitation links, automatic expiry, or public registration.
- Owner-created accounts are email-confirmed by the server-side admin API and start with `must_change_password = true`.
- Users sign in with email and password. The owner uses the same sign-in screen as everyone else.
- A user remains enabled until the owner revokes access.

### 4.2 Authoritative access state

Use a server-controlled `user_access` row for each app user, including the owner. It stores at least `disabled` and `must_change_password`. RLS permits a user to read only their own access status and does not permit client-side INSERT, UPDATE, or DELETE. Only trusted server-side admin operations can change the row.

Every protected request must verify the session with Supabase Auth and perform a fresh access-state check. Do not rely only on JWT expiry or stale claims. This fresh check is required so revocation takes effect even when an old session token is still valid.

The owner marker remains in trusted `app_metadata`; the database access row is the authoritative source for the disabled and password-change-required flags. Use Supabase's ban mechanism as defense in depth if the Admin API supports a suitable ban duration, but the application-side fresh access check is mandatory regardless.

The sign-in flow must reject disabled accounts before granting an application session. If Supabase issues a temporary auth session during the check, do not return or retain its cookies/tokens for a disabled user; clear them and return a generic access-denied message. Restoring a user clears the disabled state and reverses any applied ban.

### 4.3 Protected and intentionally public routes

Every protected application API route must require a server-verified session and a fresh, non-disabled `user_access` row. This includes:

- `/api/chat`
- `/api/transcribe` is a protected API and requires a verified, non-disabled user session, including a fresh access-state check. It must enforce strict audio limits, timeout/cancellation, and safe errors.
- conversation and message APIs
- file upload, metadata, download/signing, and delete APIs
- any dedicated search API added later
- admin APIs, with the additional owner/AAL2 requirements below

The Tavily tool is internal to `/api/chat` today and inherits chat authorization.

Intentional authentication exceptions are limited to the minimum endpoints needed to sign in, sign out, request password reset, complete a password reset, and complete required MFA enrollment/challenge. These endpoints must not expose private application data. Password-reset requests must not reveal whether an email exists. A disabled account must not gain access to application APIs through an authentication exception.

The health endpoint may remain public only if it continues to expose sanitized status/configuration booleans and no secrets, user information, or detailed provider diagnostics.

If `must_change_password` is true, the user may access only the password-change flow, sign-out, and the minimum authentication/MFA operations required to complete account setup. Chat, conversations, search, transcription, files, and other normal application APIs remain blocked until the password has been changed successfully.

### 4.4 Owner admin and MFA

- The owner-only page is `/admin`.
- Admin API routes independently verify the server-authenticated user's owner marker and an MFA-verified session with assurance level `aal2`.
- Enforce TOTP MFA only for `/admin` and admin API routes. The normal chat must not require an authenticator code.
- On first admin entry, an authenticated owner without an enrolled TOTP factor may access only the enrollment gate: generate/display the QR code, enter a code from an authenticator app, and verify it. Do not reveal user lists or permit admin actions before the session reaches `aal2`.
- An owner with an enrolled factor but an `aal1` session must complete the TOTP challenge before seeing the admin functions.
- Verify assurance level on the server for every admin API request; a client-side route guard is not sufficient.
- Keep the admin UI small, responsive, and consistent with the existing theme.

Admin functions:

1. Create a user from an email and a password entered by the owner. The server calls the Supabase Admin API, marks the email confirmed, and sets `must_change_password`. The typed password is forwarded to the Admin API only; never log, persist, or return it.
2. List users with status.
3. Revoke access.
4. Restore access.
5. Delete a user.
6. Set a new temporary password and force a password change.

Admin list/actions must use server-side privileged operations. Validate inputs and avoid returning tokens, password values, secrets, or raw provider errors.

### 4.5 Passwords and Brevo SMTP

- Users can change their password while signed in.
- Users can request an email password reset and complete the reset flow.
- Customize the Supabase password-reset email template.
- Configure Brevo as the custom SMTP provider under Supabase Authentication SMTP settings.
- Document and verify a sender address or domain, SPF and DKIM records, and any sender verification required by Brevo.
- Store SMTP credentials only in Supabase settings. Never put them in frontend code, source control, `.env.example`, Worker variables, logs, or API responses.
- Password reset requests should use generic success responses to avoid account enumeration.

Brevo setup checklist:

- [ ] Sender email/domain is verified.
- [ ] SPF is configured correctly.
- [ ] DKIM is configured and verified.
- [ ] Supabase SMTP host, port, username, and password are configured in Supabase settings.
- [ ] Credentials are not present in the repository or Cloudflare Worker secrets.
- [ ] Supabase password-reset template uses the correct recovery URL and clear branding.
- [ ] Reset email arrives at a real test mailbox.
- [ ] Reset link opens the application and permits setting a new password.
- [ ] Expired/used links fail safely.
- [ ] Unknown-email requests do not reveal account existence.
- [ ] Email delivery failures are handled with clear, non-sensitive messages.

### 4.6 Additional security requirements

- Identity comes from the server-verified session, never from a request-body `user_id`.
- Enable RLS on every application table.
- Keep service-role and provider keys server-side.
- Rate-limit sign-in attempts and owner admin actions where practical.
- Never log or store plaintext passwords, reset tokens, TOTP secrets, SMTP credentials, or provider API keys.
- An optional allowlist of permitted email addresses may be implemented later as a Cloudflare Worker secret, but is not required for the initial design.
- Validate uploaded file contents/type and size server-side; do not trust the browser MIME type alone.
- Treat external search results and document contents as untrusted input, not instructions.

## 5. Database schema

Create fresh migrations under `supabase/migrations/`. Use UUID primary keys, foreign keys, constraints, timestamps, indexes, and RLS. The core schema must not contain GitHub-specific columns or dependencies.

### 5.1 `conversations`

- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`
- `title TEXT NOT NULL DEFAULT 'New chat'`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- Index `(user_id, updated_at DESC)`

### 5.2 `messages`

- `id UUID PRIMARY KEY`
- `conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE`
- `role TEXT NOT NULL CHECK (role IN ('user', 'assistant'))`
- `parts JSONB NOT NULL DEFAULT '[]'::jsonb`
- `sequence_number BIGINT NOT NULL`
- `status TEXT NOT NULL CHECK (status IN ('complete', 'interrupted', 'failed'))`
- `reply_to_message_id UUID NULL REFERENCES public.messages(id) ON DELETE SET NULL`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- Unique `(conversation_id, sequence_number)`
- Index `(conversation_id, sequence_number)`
- A partial unique index should ensure no more than one assistant row maps to a given user turn through `reply_to_message_id`, where the relationship is non-null.
- The only roles in this phase are `user` and `assistant`. Documentation may note that tool/system roles could be added later, or tool activity could be represented in `parts`. Do not implement those roles now.

The server validates message structure before storage. The client-generated user message ID is used as the idempotency key. Assistant IDs are fixed by the server before streaming starts.

### 5.3 `files`

- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`
- `conversation_id UUID NULL REFERENCES public.conversations(id) ON DELETE SET NULL`
- `bucket_id TEXT NOT NULL`
- `storage_path TEXT NOT NULL`
- `original_name TEXT NOT NULL`
- `mime_type TEXT NOT NULL`
- `size_bytes BIGINT NOT NULL CHECK (size_bytes > 0)`
- `status TEXT NOT NULL CHECK (status IN ('uploaded', 'processing', 'ready', 'failed'))`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- Unique `(bucket_id, storage_path)`
- Indexes on `(user_id, created_at DESC)` and `(conversation_id)`

The owner of an associated conversation must match `files.user_id`. File metadata stores references and verified metadata, never binary file contents. Do not persist signed URLs as durable identifiers.

### 5.4 `user_access` — server-controlled access state

- `user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE`
- `disabled BOOLEAN NOT NULL DEFAULT false`
- `must_change_password BOOLEAN NOT NULL DEFAULT false`
- `created_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`

RLS is enabled. Authenticated users may SELECT only their own row. There are no client INSERT/UPDATE/DELETE policies. Trusted server-side admin code creates and updates rows. Seed the manually created owner row during setup. Do not put the owner marker in this table as a substitute for the trusted `app_metadata` owner marker.

### 5.5 RLS policy rules

- `conversations`: users can select/insert/update/delete only rows where `user_id = auth.uid()`.
- `messages`: users can read or mutate a message only when its parent conversation belongs to `auth.uid()`. Ensure any `reply_to_message_id` relationship remains within the same conversation.
- `files`: users can select their own metadata; insert/update/delete is allowed only through a validated upload/API flow or carefully scoped user policies that preserve owner and conversation consistency. Do not allow a user to change ownership or storage paths to another user's prefix.
- `user_access`: users can select their own row; no user-facing write policies.
- Storage objects in the private bucket: authenticated upload/read/delete is limited to paths under that user's UUID prefix. The API must also verify the matching `files` metadata record and conversation ownership.
- Test RLS with two distinct users and with an unauthenticated client. Do not rely solely on UI filtering.

## 6. Stage 1 — Tavily limits

**Scope:** preserve existing protections and add the aggregate excerpt budget.

Existing protections in `lib/tavily-search.mjs` include maximum five results, maximum 1,200 characters per excerpt, maximum 128 KiB provider response body, HTTPS URL validation, URL normalization/deduplication, one bounded retry, cancellation support, and safe errors.

Add a maximum **4,000 combined characters of excerpt content** across all accepted results. Titles and URLs retain their own existing bounded fields and do not count as excerpt characters. The aggregate limit is applied after per-result truncation and deduplication. Mark results partial if a result excerpt is truncated or omitted due to the budget. Do not remove current safeguards.

**Files:** `lib/tavily-search.mjs`, `tests/tavily-search.test.mjs`; update `tools/web_search.ts` only if its output contract must change.

**Assumptions:** Tavily remains the provider; the five-result and 1,200-character limits remain unchanged; the aggregate budget is exactly 4,000 excerpt characters.

**Verification:**

- [ ] Existing Tavily tests still pass.
- [ ] No more than five results are returned.
- [ ] No excerpt exceeds 1,200 characters.
- [ ] Combined excerpt content never exceeds 4,000 characters.
- [ ] Deduplication, HTTPS validation, response-body limits, retry, cancellation, and safe errors still work.
- [ ] Truncation/omission is marked partial.
- [ ] Malformed and oversized provider responses fail safely.
- [ ] Unit tests, lint, typecheck, and Worker build pass.

Complete Stage 1's implementation and add its tests before moving to Stage 2. Run the consolidated test suite after Batch 4.

## 7. Stage 2 — Supabase foundation

**Scope:** create the fresh Supabase project schema, indexes, constraints, RLS, and private-storage policy groundwork. No application auth or persistence integration yet.

**Files to add:** `supabase/migrations/0001_initial_schema.sql`, `docs/architecture/SUPABASE_SCHEMA.md`. Add a separate migration for Storage bucket/policies when the bucket is configured in Stage 5 if that keeps the schema migration clean.

**Design and assumptions:**

- Use the four tables described above: `conversations`, `messages`, `files`, and `user_access`.
- Public sign-up will be disabled in Supabase dashboard settings in Stage 3.
- RLS is enabled from table creation, even before app integration.
- Do not store file blobs, secrets, provider credentials, passwords, or TOTP seeds in application tables.
- No GitHub-specific schema is added.

**Verification:**

- [ ] Fresh Supabase project applies the migrations successfully.
- [ ] Tables, foreign keys, checks, unique constraints, and indexes match this spec.
- [ ] RLS is enabled on all four tables.
- [ ] Anonymous access is denied.
- [ ] Two-user tests prove that users cannot read or modify each other's conversations, messages, files, or access state.
- [ ] Clients cannot change `disabled` or `must_change_password`.
- [ ] Cross-conversation reply references and cross-owner file/conversation associations are rejected.
- [ ] Schema and policy setup is documented.
- [ ] No application code is changed to depend on the schema until this stage passes.

## 8. Stage 3 — Supabase Auth and owner-managed users

**Voice endpoint decision:** `POST /api/transcribe` is authenticated like the other private application APIs. It must use the verified session and fresh disabled/password-change checks; it must not accept a user identity from the request body. The feature flag remains a separate operational kill switch.

**Voice recording limit:** cap each browser recording at **15 minutes maximum**. Show a visible elapsed-time indicator/countdown. At 15 minutes, automatically stop recording and submit the captured audio for transcription; insert the transcript into the composer without automatically sending the chat message. Manual Stop/Send behavior before the limit remains available. Prevent further recording beyond 15 minutes, handle upload/transcription failures without losing the user's draft where feasible, and test the timer and boundary behavior. The server must independently enforce a maximum audio duration where the format/provider permits reliable validation, plus a conservative upload byte limit and request timeout; a client-side timer alone is not a security control.

**Scope:** implement email/password sign-in, owner-only admin with TOTP MFA, forced first password change, password change/reset, immediate revocation, and Brevo SMTP setup documentation.

**Likely files to add/change, after inspecting current conventions and installed SDK versions:**

- `lib/supabase/client.ts`
- `lib/supabase/server.ts`
- `lib/supabase/admin.ts` (server-only service-role client)
- `lib/auth/require-user.ts` (verified session and fresh access check)
- `lib/auth/require-owner-admin.ts` (owner marker and AAL2 check)
- `app/login/page.tsx`
- `app/admin/page.tsx`
- `app/auth/callback/route.ts`, if required by the chosen SSR flow
- sign-in, sign-out, password change/reset, MFA enrollment/challenge, and admin API routes under the existing route conventions
- `proxy.ts` or the version-appropriate session refresh mechanism only if required by the installed Next.js/Supabase SSR integration
- `.env.example`, `README.md`, and `docs/architecture/AUTH_AND_EMAIL_SETUP.md`
- tests for auth guards, disabled users, password-change gates, owner checks, and MFA assurance checks

Before coding, verify compatibility with the repository's Next.js 16, React 19, OpenNext Cloudflare runtime, and the exact Supabase SDK versions. Do not copy middleware or SSR examples written for incompatible versions.

**Stage 3 behavior:**

1. Disable Supabase public sign-up and provide no sign-up UI or endpoint.
2. Manually create the owner in the Supabase dashboard; mark owner in trusted `app_metadata`; seed the owner's `user_access` row.
3. Sign-in uses email and password for both owner and created users.
4. A created user starts with `must_change_password = true`; block normal application APIs until the user changes it.
5. The owner can open `/admin`; the first visit supports TOTP enrollment and QR verification. An owner without `aal2` sees only enrollment/challenge UI, not admin data or controls.
6. Every admin API verifies the owner marker and `aal2` on the server.
7. Admin user creation uses the Supabase Admin API server-side, confirms email, and creates the server-controlled `user_access` row. The typed password is never logged or stored.
8. User listing combines Auth admin user data with the access-state rows and displays useful status without exposing secrets.
9. Revocation sets `disabled = true`, attempts a supported Supabase ban as defense in depth, and blocks every protected request through a fresh DB access check. The sign-in flow must reject disabled users and must not retain an app session for them.
10. Restore clears `disabled` and reverses the ban if used. Delete removes the Auth user and cascades related app data according to the schema.
11. Setting a temporary password uses the Admin API, marks `must_change_password = true`, and does not return or log the password.
12. Password reset emails use Supabase Auth configured with Brevo SMTP.

**Assumptions:** Supabase Auth owns user identity; trusted owner role is in `app_metadata`; `user_access` is the authoritative immediate-revocation and forced-password-change source. If the Supabase ban API cannot provide a suitable long ban, application sign-in and every protected API must still enforce the authoritative disabled state.

**Verification:**

- [ ] Public sign-up is disabled in Supabase and unreachable through the app.
- [ ] Unauthenticated requests to every protected API route, including `/api/transcribe`, are rejected.
- [ ] Only the owner can open `/admin`, and only after a verified authenticator code.
- [ ] Admin API routes reject a session without `aal2`.
- [ ] First-time TOTP enrollment displays a QR code and requires successful verification.
- [ ] The normal chat does not ask for an authenticator code.
- [ ] Non-owners cannot reach admin pages or admin APIs.
- [ ] The owner can create a user, and that user can sign in.
- [ ] A new user must change the temporary password before using chat.
- [ ] Users can change passwords and complete password reset.
- [ ] Password-reset emails arrive through Brevo and the reset link works.
- [ ] Revoking a user blocks their API requests immediately, even with an existing session.
- [ ] A revoked user cannot access the app/sign in; a restored user can.
- [ ] No service-role key, SMTP credential, TOTP secret, reset token, or plaintext password appears in client code, logs, or responses.
- [ ] Auth and admin attempts are rate-limited where practical.
- [ ] Existing UI and the Cloudflare Worker build remain functional.

Complete Stage 3's implementation and add its tests before moving to Stage 4. Run the consolidated test suite after Batch 4.

## 9. Stage 4 — Conversation and message persistence

**Scope:** persist conversations and messages and load them after refresh, while preserving AI SDK streaming.

**Files:** `app/api/chat/route.ts`, new conversation/message routes under `app/api/conversations/`, `components/chat.tsx`, `components/chat-sidebar.tsx`, Supabase server helpers/types, and persistence tests.

**API responsibilities:** list/create/load/update/delete a user's conversations and read/write ordered messages. Every route authenticates the session, checks the fresh `user_access` row, and verifies conversation ownership. The client never supplies a trusted owner ID.

**Message ID and retry semantics:**

- The client generates the user message UUID. The server validates it and inserts the user message with insert-on-conflict-do-nothing on that ID.
- On conflict, verify the existing row belongs to the same authenticated user/conversation and is a user message. If not, reject; never treat a foreign or mismatched ID as an idempotent retry.
- The server fixes the assistant message ID before streaming starts. Use a deterministic server-derived ID based on the conversation and user message IDs, or an equivalently reliable server-controlled idempotency mapping, so retries reuse the same assistant ID. Never trust a client-supplied assistant ID.
- Associate the assistant row with its user turn through `reply_to_message_id`; use a uniqueness constraint to avoid duplicate assistant rows for that turn.
- Do not persist streaming chunks.
- On successful stream completion, save the final assistant message and `status = 'complete'` in one terminal write.
- If generation fails, save one terminal assistant record with `status = 'failed'`; do not save chunks or misleading partial output.
- If the user stops the stream, save the final partial text once with `status = 'interrupted'` if the AI SDK reliably exposes it at the terminal callback; otherwise save an empty parts array with `interrupted`. Do not write intermediate chunks.
- A retry for the same user message reuses the same assistant ID and replaces the failed/interrupted attempt rather than inserting a second assistant message.
- Regenerate updates/replaces the prior assistant message for that turn using the same assistant ID instead of adding another row.
- Register the terminal save with the Cloudflare execution context's supported `waitUntil` mechanism (or the version-appropriate OpenNext equivalent) so the Worker does not abandon the final write. Handle save failures safely and report them through non-sensitive diagnostics.
- Document these failure semantics in `docs/architecture/MESSAGE_PERSISTENCE.md` before implementing them. Verify the installed AI SDK's terminal/abort callbacks and Cloudflare context API rather than assuming callback behavior.

**Streaming constraints:** keep streaming responses to the browser. Never buffer the entire generated response just to return it. A terminal database write is permitted; chunk-by-chunk database writes are not.

**Verification:**

- [ ] Conversations and messages survive refresh.
- [ ] Sidebar lists only the current user's conversations and allows loading an older one.
- [ ] User messages and completed assistant messages persist in order.
- [ ] Client-generated user IDs prevent duplicate inserts on retry.
- [ ] A mismatched/foreign duplicate ID is rejected.
- [ ] Assistant ID is fixed before streaming starts.
- [ ] Successful streams write the assistant message once with `complete`.
- [ ] Provider failures result in `failed`, without chunk writes.
- [ ] User-stopped streams follow the documented `interrupted` semantics.
- [ ] Retry reuses the assistant ID and replaces the failed attempt.
- [ ] Regenerate replaces the prior assistant message.
- [ ] Final saves are registered with `waitUntil` or the verified equivalent.
- [ ] Streaming, Tavily tool use, and voice input still work.
- [ ] User A cannot load, update, delete, or append to User B's conversations.
- [ ] Unauthenticated and disabled-user requests are rejected.

Complete Stage 4's implementation and add its tests before moving to Stage 5. Run the consolidated test suite after Batch 4.

## 10. Stage 5 — Supabase private file storage

**Scope:** create a private bucket and secure upload/metadata/delete flow. Keep attachment UI changes for Stage 6.

**Files:** `app/api/files/route.ts`, `app/api/files/[fileId]/route.ts` or equivalent existing route conventions, `lib/files/validation.ts`, `lib/supabase/storage.ts`, Storage policy migration/docs, and tests.

**Design:**

- Create a private bucket named `user-files`.
- Store files under an opaque path shaped like `<user-uuid>/<file-uuid>/<safe-filename>`.
- Start with PNG/JPEG/WebP; add PDF/TXT/DOCX only in Stage 8 when processing is available.
- Resize/compress images in the browser before upload, but independently validate actual file size, signature/type, and allowed MIME type server-side.
- Choose and document conservative byte/dimension limits based on the Supabase free plan and selected provider. Do not increase the existing 1 MiB per-image / 3 MiB aggregate application limits without tests and a documented reason.
- Create metadata only after a successful upload, and verify actual storage object size/ownership before using a file.
- Do not store base64 blobs in messages or the database.
- Use short-lived signed URLs only when a provider requires URL access. Never make the bucket public.
- Clean up orphaned objects/metadata safely; don't silently delete files still referenced by a conversation.

**Verification:**

- [ ] Bucket is private.
- [ ] Only allowed types and sizes are accepted.
- [ ] Server validates actual uploaded size/type rather than trusting client claims.
- [ ] Image preprocessing happens before upload.
- [ ] Metadata is created only after a successful upload.
- [ ] Users cannot read, overwrite, or delete another user's object.
- [ ] Cross-owner conversation/file associations are rejected.
- [ ] No public URL is generated for private files.
- [ ] Signed URLs are short-lived and not stored as durable references.
- [ ] Failed uploads can be retried safely.
- [ ] Upload and storage quota errors are clear and do not corrupt chat history.

Complete Stage 5's implementation and add its tests before moving to Stage 6. Run the consolidated test suite after Batch 4.

## 11. Stage 6 — Attachment drawer

**Scope:** replace direct image-in-chat uploads with upload-first file references while preserving the current composer and voice controls.

**Files:** `components/prompt-form.tsx`, `components/chat.tsx`, a new `components/attachment-drawer.tsx`, a client upload helper such as `lib/files/upload-client.ts`, and related tests. Reuse existing shadcn components; add the Drawer component only if it is not already available.

**Design:**

- The plus button opens a mobile-friendly bottom drawer.
- Enable only implemented actions. Initially, image upload is enabled. Document upload appears only when PDF support is actually working in Stage 8.
- Show previews, file names, upload progress, removal controls, and recoverable errors.
- Preserve the draft when the drawer opens/closes.
- On selection: validate → resize/compress images → upload to private Supabase Storage → create metadata → attach the file ID/reference to the pending message.
- The chat request contains text and file IDs/references only, never base64 bytes or a permanent public URL.
- Keep attachments selected until the user removes them or sends the message. On send, preserve retryability if the chat request fails.
- Respect mobile layout, light/dark theme, keyboard interaction, and existing voice transcription behavior.

**Verification:**

- [ ] Plus button opens/closes the drawer.
- [ ] Drawer works on mobile and desktop.
- [ ] Draft remains intact when the drawer closes.
- [ ] Preview, remove, progress, and error states work.
- [ ] Upload failure allows retry.
- [ ] Successful attachments are represented by file references.
- [ ] Chat request contains no base64 file payload.
- [ ] No unfinished or nonfunctional buttons are shown.
- [ ] Existing composer, model selector, and voice controls still work.

Complete Stage 6's implementation and add its tests before moving to Stage 7. Run the consolidated test suite after Batch 4.

## 12. Stage 7 — External vision

**Scope:** route image questions to an external hosted vision provider while normal text generation remains on Cloudflare Workers AI.

**Files:** add `lib/providers/vision.ts` (or the established provider-module convention), update `lib/models.ts`, `app/api/chat/route.ts`, runtime environment documentation, and vision tests.

**Design:**

- Start with Groq if the chosen model, free quota, and image limits fit.
- Keep provider credentials server-side.
- Authenticate and verify file ownership before fetching or signing a file.
- Resolve a file ID through trusted metadata; never accept arbitrary client URLs as authority.
- Use short-lived signed access or provider upload according to the provider's supported API.
- Normalize provider errors and enforce timeouts, image count/size limits, and quota handling.
- Keep text-only chat on Cloudflare Workers AI.
- Stream the resulting answer to the user and persist it under Stage 4's terminal-write semantics.
- Do not add image generation.

**Verification:**

- [ ] Text-only chat uses Cloudflare Workers AI.
- [ ] Image requests use the external vision provider.
- [ ] File ownership is verified before provider access.
- [ ] Chat requests contain file references, not base64.
- [ ] Unsupported or oversized images fail clearly.
- [ ] Vision responses return/stream correctly.
- [ ] Provider timeout, quota, and unavailable errors are safe and actionable.
- [ ] Normal chat, search, persistence, and voice remain functional.

Complete Stage 7's implementation and add its tests before moving to Stage 8. Run the consolidated test suite after Batch 4.

## 13. Stage 8 — PDF, TXT, and DOCX

**Scope:** add document processing, in this order: PDF first, then TXT, then DOCX.

**Files:** add `lib/providers/documents.ts` and the required document processing route/service; update `lib/files/validation.ts`, `components/prompt-form.tsx`, attachment UI, provider environment docs, and tests.

**Design:**

- Gemini API is the initial PDF candidate, only if its available free allocation, supported file method, size/page limits, and usage terms fit.
- A document file is uploaded to private Supabase Storage; the chat message carries its file reference.
- Verify the user owns the file before provider access.
- Use a short-lived signed URL or provider upload, depending on supported provider capabilities.
- Enforce document byte limits, supported types, processing timeouts, and bounded context sent to Cloudflare Workers AI.
- PDF support includes summarization and questions about document contents.
- TXT support follows PDF; DOCX follows TXT.
- Never imply that a truncated or partially processed document was fully analyzed. Tell the user when the provider or application limit prevents full processing.
- Do not introduce image generation or a paid provider fallback without approval.

**Verification:**

- [ ] PDF uploads to private storage and can be summarized/questioned.
- [ ] PDF processing respects provider free limits and size/page limits.
- [ ] TXT support works after PDF is accepted.
- [ ] DOCX support works after TXT is accepted.
- [ ] Invalid, encrypted/unsupported, malformed, or oversized documents fail clearly.
- [ ] Private files remain private.
- [ ] Document content is bounded before text generation.
- [ ] Quota, timeout, and provider failures preserve the uploaded file and allow a retry.
- [ ] Attachment UI enables each format only after its backend works.
- [ ] Normal chat, vision, Tavily, persistence, and voice remain functional.

Complete Stage 8's implementation and add its tests before moving to Stage 9. Run the consolidated test suite after Batch 4.

## 14. Stage 9 — Supabase keep-alive job

**Scope:** configure a Cloudflare Cron Trigger to make a lightweight request to Supabase at the lowest frequency that satisfies the applicable plan activity requirement.

**Files:** `wrangler.jsonc`, the existing OpenNext scheduled-handler integration or a compatible scheduled entry point, deployment settings, and `docs/architecture/SUPABASE_KEEPALIVE.md`.

**Design:**

- Inspect the installed OpenNext Cloudflare runtime and deployment configuration before adding the scheduled handler. Do not create a conflicting second deployment.
- Use a minimal, read-only request/query that qualifies as activity under the current Supabase plan rules.
- Use a server-side secret or supported credential; never log it.
- Avoid unnecessary writes and overlapping work.
- Log only success/failure and non-sensitive timing/status information.
- Document the chosen schedule and why it is the lowest frequency that works.
- Treat this as a best-effort inactivity mitigation, not a guarantee that Supabase will never pause. Re-check plan rules during implementation.

**Verification:**

- [ ] Cron is registered in the correct Worker deployment.
- [ ] Scheduled request reaches the intended Supabase project.
- [ ] The request is lightweight and does not perform unnecessary writes.
- [ ] Secrets are not logged or exposed.
- [ ] Failures are recorded safely and do not crash application routes.
- [ ] Schedule and free-plan caveats are documented.
- [ ] Normal request handling and deployment remain functional.

Complete Stage 9's implementation and add its tests before moving to Stage 10. Run the consolidated test suite after Batch 4.

## 15. Stage 10 — End-to-end verification

Run the full suite after the earlier stages have individually passed.

**Verification checklist:**

- [ ] Normal text generation remains on Cloudflare Workers AI.
- [ ] Tavily returns at most five results, with each excerpt at most 1,200 characters and total excerpt text at most 4,000 characters.
- [ ] Public sign-up is disabled and unreachable.
- [ ] Email/password sign-in works for owner and owner-created users.
- [ ] Only the owner can open `/admin`, and only after verified TOTP/AAL2.
- [ ] Admin APIs reject non-owner and non-AAL2 sessions.
- [ ] Normal chat does not require MFA.
- [ ] Owner can create, list, revoke, restore, delete, and reset a user's temporary password.
- [ ] A new user is forced to change the temporary password.
- [ ] Brevo password-reset email delivery and recovery flow work.
- [ ] Revocation blocks requests immediately, including from a session token that has not expired.
- [ ] A revoked user cannot access the app; a restored user can.
- [ ] Unauthenticated requests to all protected APIs, including `/api/transcribe`, are rejected.
- [ ] Conversations and messages persist across refresh.
- [ ] Retry does not create duplicate user or assistant messages.
- [ ] Assistant status semantics for complete, interrupted, and failed are verified.
- [ ] Streaming works without buffering the full response or persisting chunks.
- [ ] Image uploads use private Supabase Storage and file references.
- [ ] Vision requests use the external provider and enforce file ownership.
- [ ] PDF works before TXT and DOCX are enabled.
- [ ] Voice transcription remains callable without sign-in for personal use, with strict input bounds, safe errors, feature-flag control, and documented shared-quota/abuse risk.
- [ ] RLS isolates two users across conversations, messages, files, and access state.
- [ ] Quota exhaustion, timeouts, unsupported files, and storage limits have clear errors.
- [ ] No service-role key, SMTP credential, provider secret, reset token, TOTP secret, or plaintext password appears in client bundles, logs, or responses.
- [ ] Unit tests, lint, typecheck, and `pnpm build:worker` pass.
- [ ] Deployment is not performed until explicitly authorized.

## 16. Invited-user limits — documentation only

Create `docs/architecture/INVITED_USER_LIMITS.md` as a future design note only. Do not implement code, database tables, policies, or UI for quotas in this phase.

The note must describe potential per-user controls for:
- messages per day;
- web searches per month, accounting for Tavily's shared quota;
- number of uploaded files and total storage;
- allowed file types and maximum sizes;
- transcription usage;
- allowed models and tools.

Document where these limits could later be stored (for example, a future server-managed user-limits table or server-side configuration), how every relevant route would check them, how the UI would show usage and explain a reached limit, and how the owner could adjust limits from the admin screen. Explain which shared free-tier resources the limits protect: Cloudflare Workers AI, Tavily, vision provider, PDF/document provider, Supabase database, and Supabase Storage. Describe reset windows and enforcement semantics conceptually, but add no schema or implementation in this phase.

## 17. Environment and secret inventory

Add only the variables required by each completed stage. Names below are proposed; confirm the installed SDK's recommended names and the current `lib/runtime-env.ts` conventions before implementation.

- `NEXT_PUBLIC_SUPABASE_URL` — browser-safe project URL.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — browser-safe publishable key.
- `SUPABASE_SERVICE_ROLE_KEY` — server-only admin/storage operations where required.
- `GROQ_API_KEY` — server-only vision provider.
- `GEMINI_API_KEY` — server-only document provider.
- Existing `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_AI_API_TOKEN`, `TAVILY_API_KEY`, and `VOICE_TRANSCRIPTION_ENABLED`.

Never add Brevo SMTP credentials to this list of application variables: they belong only in Supabase Authentication SMTP settings. Never commit real secret values. `.env.example` contains names and blank placeholders only. The service-role key must not be used in browser code and should be avoided for normal user-scoped database operations.

## 18. Mandatory stage workflow

Before coding each stage, provide a short design summary, exact files to change, assumptions, security implications, and stage-specific tests. Then implement only that stage, run its tests plus lint/typecheck/Worker build, inspect the diff for unrelated changes, and update the documentation with actual results. A failed test means the stage remains incomplete. Do not start the next stage until the previous stage has passed and been accepted.

This specification is planning only. Wait for explicit approval before implementing any application code or infrastructure changes.


## 17. Brilina Dev public landing page, Forge entry point, and custom domain

The public site is a Brilina Dev platform landing page, not a default sign-in screen. Brilina Forge AI is one product within the wider Brilina Dev platform; the landing page should introduce the platform and provide clear navigation to Forge and future products, services, documentation, and contact destinations as those destinations become real. Do not show dead buttons or claim unavailable products are live. Public visitors may view the landing page without an account. Access to the private Forge workspace remains invite-only and requires sign-in; public sign-up stays disabled.

### Domain architecture

- Use the purchased Brilina Dev domain as the public landing-page domain, once the exact domain is confirmed.
- Use a dedicated `forge.<root-domain>` subdomain for Brilina Forge AI. This keeps the platform homepage and Forge workspace distinct while allowing Forge to retain its current root-relative Next.js routes on its own hostname, minimizing route churn.
- Configure both hostnames through Cloudflare and map them to the appropriate deployment/Worker. Confirm the domain's current registrar/DNS nameservers and Cloudflare zone ownership before changing DNS. Do not guess the domain or change nameservers/DNS without confirming the exact hostname and current setup.
- Enable HTTPS and verify the apex/root and Forge subdomain independently. Set the production base URL and auth callback/reset redirect allowlists to the Forge hostname; do not use broad wildcard redirect URLs.
- The current domain is not yet recorded in this specification. Before DNS changes, record the exact purchased root domain, registrar, whether its DNS zone is already active in Cloudflare, and the intended production hostname. Never commit API tokens or credentials to the repository.

### Public/private route boundary

- Public: Brilina Dev landing page and its navigation; narrowly scoped sign-in, password-reset, and MFA setup/challenge endpoints; sanitized health endpoint; intentionally unauthenticated `/api/transcribe`.
- Invite-only: Forge chat, conversation/message APIs, search via chat, file metadata/storage operations, and all other private workspace APIs.
- Owner-only: `/admin` and admin APIs, requiring the owner marker and server-verified AAL2.
- The landing page must not reveal private conversations, account lists, provider secrets, internal diagnostics, or admin functionality.
- A public landing page does not mean the Forge workspace or its data is public. Do not redirect every visitor directly to sign-in; present the platform landing page first and offer a clear Forge entry point.

### Verification

- [ ] Root domain opens the Brilina Dev landing page without requiring sign-in.
- [ ] Landing-page navigation clearly distinguishes Brilina Forge AI from the wider platform and contains no dead links/buttons.
- [ ] The Forge subdomain opens the Forge experience and routes sign-in to the invite-only flow.
- [ ] Private Forge APIs reject unauthenticated and disabled users.
- [ ] `/api/transcribe` requires sign-in, rejects disabled users, and rejects oversized/unsupported audio safely.
- [ ] Root and Forge hostnames have valid HTTPS and correct Cloudflare routing.
- [ ] Auth callback, password-reset redirect, and allowed redirect URLs use the exact Forge production hostname.


## 18. Four implementation batches for the ten stages

The work remains exactly **ten numbered stages**. For execution efficiency, group those stages into four implementation batches; this grouping does not add stages or change their required order. Before each batch, provide a concise preflight summary of design, affected files, assumptions, risks, and tests. Implement the batch's stages in order, finish their local verification, and then proceed to the next batch. After all four batches, run the full end-to-end test pass in Stage 10. Do not deploy or begin GitHub integration without separate explicit approval.

| Batch | Included stages | Main outcome |
|---|---|---|
| Batch 1 | Stage 1–3 | Tavily aggregate cap; Supabase schema/RLS foundation; authenticated owner-managed access, MFA, password lifecycle, and protected transcription |
| Batch 2 | Stage 4–6 | Conversation/message persistence; private Supabase Storage; working attachment drawer and upload flow |
| Batch 3 | Stage 7–9 | External vision provider; PDF then TXT/DOCX processing; Supabase keep-alive cron |
| Batch 4 | Stage 10 plus any stage-specific acceptance fixes | Full end-to-end test run, security/quota checks, build/typecheck/lint, and resolution of discovered regressions |

Stage 10 remains the tenth and final stage. Batch 4 is the final verification/fix batch, not a new implementation stage. Domain and public landing-page work must be planned explicitly alongside deployment/setup decisions after the exact domain is confirmed; do not silently expand the ten-stage backend scope. GitHub integration stays out of scope until all ten stages pass and the user approves moving to that work.
