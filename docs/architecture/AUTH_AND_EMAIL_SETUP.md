# Authentication and email delivery setup


> **Provider status note (2026-10-24):** This guide's SMTP checklist currently describes the existing/documented Brevo setup. Resend is the intended replacement direction, but do not treat that migration as complete until the selected Supabase Auth email-delivery arrangement, secrets/settings, templates, and live password-reset/verification tests are verified. Keep provider credentials out of the repository.

## Required runtime configuration

Set the following variables for local development and Cloudflare Workers:

- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: Supabase publishable key; safe to expose to the browser.
- `SUPABASE_SERVICE_ROLE_KEY`: secret server-only key. Never use a `NEXT_PUBLIC_` prefix or commit the value.
- `VOICE_TRANSCRIPTION_ENABLED`: explicit operational kill switch; set to `true` only after Supabase Auth and the session migration are configured.

For Cloudflare Workers Builds, the two `NEXT_PUBLIC_` values must also be present in the build environment so they are compiled into the browser bundle. Configure the service-role key as an encrypted Worker secret. Do not place SMTP credentials in Cloudflare or this repository.

## Supabase project setup

1. Create a new Supabase project.
2. Apply `supabase/migrations/0001_initial_schema.sql` and `0002_voice_recording_sessions.sql`.
3. Disable public sign-ups in Supabase Auth settings.
4. Set the allowed site URL and redirect URLs for the Forge application, including `/auth/callback`.
5. Create the owner account manually in Supabase Auth.
6. In a trusted server-side setup operation, set the owner's `app_metadata.role` to `owner` and create the corresponding `public.user_access` row with `disabled = false` and `must_change_password = false`. Never use user-editable `user_metadata` as an authorization claim.
7. Configure TOTP MFA in Supabase Auth. The owner must enroll and verify an authenticator before accessing administrative data or actions. Normal chat does not require MFA.
8. Test with a non-owner account and a disabled account before enabling the feature publicly.

The application performs a fresh `user_access` lookup on each protected API request. A missing access row fails closed. A disabled user is rejected even if the browser still has an otherwise valid Supabase token. Users marked `must_change_password` can only use the password-change flow until the flag is cleared server-side.

## Brevo custom SMTP

Configure Brevo as the custom SMTP provider in Supabase Authentication settings, not in application code.

- [ ] Verify the sender email/domain in Brevo.
- [ ] Publish and verify the correct SPF and DKIM DNS records.
- [ ] Configure the SMTP host, port, username and password in Supabase Dashboard → Authentication → SMTP Settings.
- [ ] Customize the password-reset email template and confirm its redirect URL is `/auth/callback?next=/reset-password`.
- [ ] Send a reset email to a real test mailbox and verify that the reset link works.
- [ ] Confirm an unknown email receives the same generic API response as a known email.
- [ ] Keep SMTP credentials only in Supabase settings; never commit them or add them to Worker variables.

DNS records, SMTP settings, owner creation, Auth settings and live Supabase migrations are operator-controlled dashboard actions. This repository change does not perform them automatically.

## Voice recording sessions

Voice transcription requires a verified, non-disabled user. The browser requests a server-created recording session before starting the microphone. The server stores the session start time and accepts a stop/finalize request only while the session is within the 15-minute maximum. The browser automatically stops and transcribes at the limit, inserting the transcript into the composer without sending it. No timer/countdown is rendered in the UI.

The transcription endpoint requires the user's session and a stopped, unexpired recording session. Session attempts are bounded so failed audio can be retried once. The audio upload remains in-memory only; this does not add durable audio storage. A client timer is used only to trigger automatic stop, not as the server's authorization control.
