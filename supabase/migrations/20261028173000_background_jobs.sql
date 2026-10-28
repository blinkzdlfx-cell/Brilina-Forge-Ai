-- Durable background task records. Job state lives in Postgres so a browser
-- refresh or Redis outage cannot erase task progress.
create table if not exists public.background_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid null references public.conversations(id) on delete set null,
  task_type text not null default 'assistant_task' check (task_type in ('assistant_task')),
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  progress integer not null default 0 check (progress between 0 and 100),
  stage text not null default 'queued' check (char_length(stage) <= 80),
  progress_message text not null default 'Task queued.' check (char_length(progress_message) <= 500),
  input jsonb not null default '{}'::jsonb check (jsonb_typeof(input) = 'object'),
  result jsonb null check (result is null or jsonb_typeof(result) = 'object'),
  error_code text null,
  error_message text null,
  idempotency_key text null,
  attempt integer not null default 0 check (attempt >= 0),
  max_attempts integer not null default 2 check (max_attempts between 1 and 5),
  started_at timestamptz null,
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create index if not exists background_jobs_user_created_idx
  on public.background_jobs (user_id, created_at desc);
create index if not exists background_jobs_status_updated_idx
  on public.background_jobs (status, updated_at);

create table if not exists public.background_job_events (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.background_jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  stage text not null check (char_length(stage) <= 80),
  message text not null check (char_length(message) between 1 and 500),
  progress integer not null check (progress between 0 and 100),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists background_job_events_job_id_idx
  on public.background_job_events (job_id, id);

alter table public.background_jobs enable row level security;
alter table public.background_job_events enable row level security;
revoke all on table public.background_jobs from anon, authenticated;
revoke all on table public.background_job_events from anon, authenticated;
