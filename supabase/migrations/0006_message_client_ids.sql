-- Stable client message identifiers allow idempotent saves from AI SDK clients.
alter table public.messages
  add column if not exists client_message_id text;

create unique index if not exists messages_conversation_client_id_idx
  on public.messages (conversation_id, client_message_id)
  where client_message_id is not null;
