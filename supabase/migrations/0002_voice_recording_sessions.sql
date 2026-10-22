-- Short-lived server-controlled voice recording sessions.
-- This table is server-only; browser clients have no table privileges or RLS policies.

create table if not exists public.voice_recording_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  stopped_at timestamptz null,
  expires_at timestamptz not null default (now() + interval '20 minutes'),
  attempt_count integer not null default 0 check (attempt_count between 0 and 2),
  created_at timestamptz not null default now(),
  check (expires_at > started_at),
  check (stopped_at is null or stopped_at >= started_at)
);

create index if not exists voice_recording_sessions_user_started_idx
  on public.voice_recording_sessions (user_id, started_at desc);
create index if not exists voice_recording_sessions_expiry_idx
  on public.voice_recording_sessions (expires_at);

alter table public.voice_recording_sessions enable row level security;
revoke all on table public.voice_recording_sessions from anon, authenticated;
