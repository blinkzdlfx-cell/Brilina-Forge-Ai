# Recording-session failure — 2026-10-23

## Reported symptom
The microphone worked for roughly two or three transcription attempts. On a later attempt, the UI showed: “Could not start a secure recording session.”

## Evidence checked before adding diagnostics
- The app returns that message when POST /api/transcribe/session does not return a successful response with a string sessionId; the route emits it when the database insert fails or its handler catches an exception.
- Supabase REST logs showed successful POST responses (201) for public.voice_recording_sessions at 13:12–14:25 UTC, successful session-finalization updates (PATCH 200), successful attempt-count updates (PATCH 200), and successful cleanup deletes (DELETE 204).
- At query time, two rows remained unfinished (stopped_at IS NULL), started at 2026-10-23 14:22:04 UTC and 14:25:56 UTC; both belonged to the same non-owner test account. This is consistent with recording attempts that did not reach the finish handler, but does not prove why.
- Supabase logs do not contain Cloudflare Worker application-level response bodies or the exact failed route invocation. Successful database calls alone cannot identify the failing request.

## Conclusion
Root cause is NOT YET CONFIRMED. Do not assume the session table or Supabase insert is the cause. Add redacted server-side diagnostics that capture the failing stage, status, safe database error code, and request correlation ID. Never log audio, transcript, prompts, email addresses, IP addresses, auth cookies, or secrets.

## Follow-up
Reproduce after deploying secure diagnostics, then open /admin/diagnostics as the owner with verified MFA. Inspect the newest event and compare its timestamp/request ID with Cloudflare Worker observability logs if necessary.
