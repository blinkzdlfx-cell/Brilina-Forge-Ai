-- Durable conversation controls and private file storage foundation.
-- This migration is additive. It does not apply itself to the live Supabase project.

alter table public.conversations
  add column if not exists is_pinned boolean not null default false,
  add column if not exists archived_at timestamptz null;

create index if not exists conversations_active_user_idx
  on public.conversations (user_id, is_pinned desc, updated_at desc)
  where archived_at is null;

create index if not exists conversations_archived_user_idx
  on public.conversations (user_id, archived_at desc)
  where archived_at is not null;

-- A conversation title already exists in migration 0001. Keep it as the durable
-- user-visible name; application code may derive it from the first user prompt
-- and allow the user to rename it later.

-- Private bucket for images and supported documents. The server must still
-- validate ownership, actual file type, and size before processing.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'forge-private-files',
  'forge-private-files',
  false,
  10485760,
  array[
    'image/png', 'image/jpeg', 'image/webp',
    'text/plain', 'text/markdown', 'text/x-markdown', 'text/csv', 'text/html', 'application/json',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists forge_private_files_select_own on storage.objects;
create policy forge_private_files_select_own
on storage.objects for select to authenticated
using (
  bucket_id = 'forge-private-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists forge_private_files_insert_own on storage.objects;
create policy forge_private_files_insert_own
on storage.objects for insert to authenticated
with check (
  bucket_id = 'forge-private-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists forge_private_files_update_own on storage.objects;
create policy forge_private_files_update_own
on storage.objects for update to authenticated
using (
  bucket_id = 'forge-private-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'forge-private-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists forge_private_files_delete_own on storage.objects;
create policy forge_private_files_delete_own
on storage.objects for delete to authenticated
using (
  bucket_id = 'forge-private-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
