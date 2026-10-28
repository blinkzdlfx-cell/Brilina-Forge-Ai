-- Active stream state is metadata only. Message contents remain in the
-- owner-scoped messages table; stream chunks are kept temporarily in Redis.
alter table public.conversations
  add column if not exists active_stream_id text,
  add column if not exists active_generation_status text not null default 'idle',
  add column if not exists active_assistant_message_id text,
  add column if not exists active_generation_started_at timestamptz;

alter table public.conversations
  drop constraint if exists conversations_active_generation_status_check;

alter table public.conversations
  add constraint conversations_active_generation_status_check
  check (active_generation_status in ('idle', 'running', 'completed', 'stopped', 'failed'));

create index if not exists conversations_active_stream_id_idx
  on public.conversations (active_stream_id)
  where active_stream_id is not null;
