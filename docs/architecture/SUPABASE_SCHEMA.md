# Supabase schema and security setup

This document describes the initial, empty Supabase project for Brilina Forge AI. It does not mean a remote project has been configured or migrated.

## Migration

Apply `supabase/migrations/0001_initial_schema.sql` to the new Supabase project using the Supabase CLI or SQL Editor. Review the migration first and apply it to the intended project only. Do not paste the service-role key into SQL, source control, or a client environment variable.

The migration creates:

- `conversations`: user-owned chat containers.
- `messages`: ordered user/assistant message parts with status and reply linkage.
- `files`: metadata references only; no file bytes or signed URLs.
- `user_access`: server-controlled disabled/password-change flags.

All four tables have RLS enabled. Anonymous table privileges are revoked. Authenticated users can access only their own conversation data; file metadata and access-state rows are read-only to clients. Trusted server APIs use the service-role client for operations that must not be client-writable.

## Ownership invariants

- A message must belong to a conversation owned by the same authenticated user.
- A reply reference must point to a message in the same conversation.
- A file's `storage_path` must be prefixed with its owning user's UUID followed by `/`.
- If a file has a conversation, that conversation must belong to the same user.
- `user_access` has no client insert/update/delete policy. Never authorize using user-editable `user_metadata`.

## Owner bootstrap

1. Create the owner account manually in Supabase Auth after configuring the project.
2. In trusted server-side administration, mark the owner with `app_metadata.role = 'owner'`. Do not use user-editable metadata.
3. Insert the owner's `user_access` row, with `disabled = false` and `must_change_password = false`. The owner UUID comes from Supabase Auth; never guess or hardcode it.
4. Keep public sign-up disabled in Supabase Auth settings.

## Verification checklist

- [ ] Apply the migration to a fresh project.
- [ ] Confirm the four tables exist and RLS is enabled.
- [ ] Confirm anonymous requests cannot read any table.
- [ ] With two real test accounts, verify cross-user reads and writes are denied.
- [ ] Verify a reply reference into another conversation is rejected.
- [ ] Verify a file path outside the owning UUID prefix is rejected.
- [ ] Verify authenticated clients cannot insert/update/delete `files` or `user_access`.
- [ ] Run Supabase database security advisors and resolve applicable findings.

Private storage configuration is defined by migrations `0005_conversation_controls_private_storage.sql` (private 10 MiB file bucket) and `0007_private_audio_storage.sql` (private 20 MiB audio bucket). The audio migration must be applied to the intended preview/test database before testing direct audio uploads; do not apply it to production without separate explicit approval. These files do not prove that either bucket or its policies exist in a live Supabase project.
