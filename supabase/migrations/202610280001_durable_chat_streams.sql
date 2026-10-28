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

-- A turn has one user message and can have several assistant response versions.
-- Older versions remain in the database; only the active version is displayed.
alter table public.messages
  add column if not exists turn_message_id text,
  add column if not exists version_number integer not null default 1,
  add column if not exists is_active_version boolean not null default true;

update public.messages
set turn_message_id = client_message_id
where role = 'user' and turn_message_id is null;

update public.messages as assistant
set turn_message_id = (
  select user_message.client_message_id
  from public.messages as user_message
  where user_message.conversation_id = assistant.conversation_id
    and user_message.role = 'user'
    and user_message.sequence_number < assistant.sequence_number
  order by user_message.sequence_number desc
  limit 1
)
where assistant.role = 'assistant' and assistant.turn_message_id is null;

create index if not exists messages_turn_versions_idx
  on public.messages (conversation_id, turn_message_id, version_number);

create index if not exists messages_active_order_idx
  on public.messages (conversation_id, sequence_number)
  where is_active_version = true;
