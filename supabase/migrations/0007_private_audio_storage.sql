-- Private audio bucket for direct browser-to-Supabase uploads.
-- This migration is repository-only until explicitly approved and applied.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'forge-private-audio',
  'forge-private-audio',
  false,
  20971520,
  array['audio/flac', 'audio/mp4', 'audio/mpeg', 'audio/mpga', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/webm']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists forge_private_audio_select_own on storage.objects;
create policy forge_private_audio_select_own
on storage.objects for select to authenticated
using (bucket_id = 'forge-private-audio' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists forge_private_audio_insert_own on storage.objects;
create policy forge_private_audio_insert_own
on storage.objects for insert to authenticated
with check (bucket_id = 'forge-private-audio' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists forge_private_audio_update_own on storage.objects;
create policy forge_private_audio_update_own
on storage.objects for update to authenticated
using (bucket_id = 'forge-private-audio' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'forge-private-audio' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists forge_private_audio_delete_own on storage.objects;
create policy forge_private_audio_delete_own
on storage.objects for delete to authenticated
using (bucket_id = 'forge-private-audio' and (storage.foldername(name))[1] = (select auth.uid())::text);
