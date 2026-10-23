-- Brilina Forge AI core schema. This migration does not create Auth users.
-- Apply only to the new Supabase project described in the setup documentation.

create extension if not exists pgcrypto;

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New chat' check (char_length(title) between 1 and 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists conversations_user_updated_idx
  on public.conversations (user_id, updated_at desc);

create table if not exists public.messages (
  id uuid primary key,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  parts jsonb not null default '[]'::jsonb check (jsonb_typeof(parts) = 'array'),
  sequence_number bigint not null check (sequence_number >= 0),
  status text not null check (status in ('complete', 'interrupted', 'failed')),
  reply_to_message_id uuid null references public.messages(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (conversation_id, sequence_number)
);

create index if not exists messages_conversation_sequence_idx
  on public.messages (conversation_id, sequence_number);

create unique index if not exists messages_one_assistant_per_turn_idx
  on public.messages (reply_to_message_id)
  where role = 'assistant' and reply_to_message_id is not null;

create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid null references public.conversations(id) on delete set null,
  bucket_id text not null,
  storage_path text not null,
  original_name text not null check (char_length(original_name) between 1 and 255),
  mime_type text not null check (char_length(mime_type) between 1 and 127),
  size_bytes bigint not null check (size_bytes > 0),
  status text not null check (status in ('uploaded', 'processing', 'ready', 'failed')),
  created_at timestamptz not null default now(),
  unique (bucket_id, storage_path),
  check (storage_path <> '' and storage_path !~ '(^/|(^|/)\.\.(/|$))')
);

create index if not exists files_user_created_idx
  on public.files (user_id, created_at desc);
create index if not exists files_conversation_idx
  on public.files (conversation_id);

create table if not exists public.user_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  disabled boolean not null default false,
  must_change_password boolean not null default false,
  created_by uuid null references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index if not exists user_access_disabled_idx
  on public.user_access (disabled) where disabled = true;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists conversations_set_updated_at on public.conversations;
create trigger conversations_set_updated_at
before update on public.conversations
for each row execute function public.set_updated_at();

drop trigger if exists user_access_set_updated_at on public.user_access;
create trigger user_access_set_updated_at
before update on public.user_access
for each row execute function public.set_updated_at();

-- A reply reference must point to a message in the same conversation.
create or replace function public.enforce_message_reply_same_conversation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent_conversation_id uuid;
begin
  if new.reply_to_message_id is null then
    return new;
  end if;

  select m.conversation_id
    into parent_conversation_id
    from public.messages as m
    where m.id = new.reply_to_message_id;

  if parent_conversation_id is null or parent_conversation_id <> new.conversation_id then
    raise exception 'reply_to_message_id must reference a message in the same conversation'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists messages_reply_same_conversation on public.messages;
create trigger messages_reply_same_conversation
before insert or update of conversation_id, reply_to_message_id on public.messages
for each row execute function public.enforce_message_reply_same_conversation();

-- File metadata cannot point at another user's conversation or another user's path.
create or replace function public.enforce_file_owner_consistency()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  conversation_owner_id uuid;
begin
  if new.storage_path !~ ('^' || new.user_id::text || '/.+') then
    raise exception 'storage_path must be inside the owning user prefix'
      using errcode = '23514';
  end if;

  if new.conversation_id is not null then
    select c.user_id
      into conversation_owner_id
      from public.conversations as c
      where c.id = new.conversation_id;

    if conversation_owner_id is null or conversation_owner_id <> new.user_id then
      raise exception 'file conversation must belong to the same user'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists files_owner_consistency on public.files;
create trigger files_owner_consistency
before insert or update of user_id, conversation_id, storage_path on public.files
for each row execute function public.enforce_file_owner_consistency();

alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.files enable row level security;
alter table public.user_access enable row level security;

-- Explicitly remove anonymous/table-wide client access, then grant only the
-- authenticated operations supported by row-level policies.
revoke all on table public.conversations from anon, authenticated;
revoke all on table public.messages from anon, authenticated;
revoke all on table public.files from anon, authenticated;
revoke all on table public.user_access from anon, authenticated;

grant select, insert, update, delete on table public.conversations to authenticated;
grant select, insert, update, delete on table public.messages to authenticated;
grant select on table public.files to authenticated;
grant select on table public.user_access to authenticated;

drop policy if exists conversations_select_own on public.conversations;
create policy conversations_select_own on public.conversations
for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists conversations_insert_own on public.conversations;
create policy conversations_insert_own on public.conversations
for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists conversations_update_own on public.conversations;
create policy conversations_update_own on public.conversations
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists conversations_delete_own on public.conversations;
create policy conversations_delete_own on public.conversations
for delete to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists messages_select_own_conversation on public.messages;
create policy messages_select_own_conversation on public.messages
for select to authenticated
using (
  exists (
    select 1 from public.conversations c
    where c.id = conversation_id and c.user_id = (select auth.uid())
  )
);

drop policy if exists messages_insert_own_conversation on public.messages;
create policy messages_insert_own_conversation on public.messages
for insert to authenticated
with check (
  exists (
    select 1 from public.conversations c
    where c.id = conversation_id and c.user_id = (select auth.uid())
  )
);

drop policy if exists messages_update_own_conversation on public.messages;
create policy messages_update_own_conversation on public.messages
for update to authenticated
using (
  exists (
    select 1 from public.conversations c
    where c.id = conversation_id and c.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.conversations c
    where c.id = conversation_id and c.user_id = (select auth.uid())
  )
);

drop policy if exists messages_delete_own_conversation on public.messages;
create policy messages_delete_own_conversation on public.messages
for delete to authenticated
using (
  exists (
    select 1 from public.conversations c
    where c.id = conversation_id and c.user_id = (select auth.uid())
  )
);

drop policy if exists files_select_own on public.files;
create policy files_select_own on public.files
for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists user_access_select_own on public.user_access;
create policy user_access_select_own on public.user_access
for select to authenticated
using ((select auth.uid()) = user_id);

-- Intentionally no client write policies for files or user_access.
-- Trusted server-side APIs write those records using the service-role key.
