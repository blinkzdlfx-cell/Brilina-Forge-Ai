-- Add owner-managed lifecycle fields to application diagnostics.
-- Only server-side service-role code may read or mutate these records.
begin;

alter table public.secure_application_diagnostics
  add column if not exists category text not null default 'application' check (char_length(category) between 1 and 40),
  add column if not exists is_read boolean not null default false,
  add column if not exists read_at timestamptz null,
  add column if not exists resolved_at timestamptz null;

create index if not exists secure_application_diagnostics_unread_created_idx
  on public.secure_application_diagnostics (created_at desc)
  where is_read = false;

alter table public.secure_application_diagnostics enable row level security;
revoke all on table public.secure_application_diagnostics from anon, authenticated;
grant select, insert, update, delete on table public.secure_application_diagnostics to service_role;
drop policy if exists "owner can read diagnostics" on public.secure_application_diagnostics;
drop policy if exists "authenticated can read diagnostics" on public.secure_application_diagnostics;

commit;
