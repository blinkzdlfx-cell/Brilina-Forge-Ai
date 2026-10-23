-- Owner-only, redacted application diagnostics for Cloudflare Worker requests.
-- Never store prompts, transcripts, audio, auth credentials, email addresses, or IP addresses.
create table if not exists public.secure_application_diagnostics (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  event_name text not null check (char_length(event_name) between 1 and 80),
  route text not null check (char_length(route) between 1 and 120),
  level text not null default 'error' check (level in ('info', 'warning', 'error')),
  user_id uuid null references auth.users(id) on delete set null,
  request_id text not null check (char_length(request_id) between 1 and 80),
  status_code integer null check (status_code between 100 and 599),
  details jsonb not null default '{}'::jsonb
);
create index if not exists secure_application_diagnostics_created_idx on public.secure_application_diagnostics (created_at desc);
create index if not exists secure_application_diagnostics_event_idx on public.secure_application_diagnostics (event_name, created_at desc);
alter table public.secure_application_diagnostics enable row level security;
revoke all on table public.secure_application_diagnostics from anon, authenticated;
grant select, insert on table public.secure_application_diagnostics to service_role;
