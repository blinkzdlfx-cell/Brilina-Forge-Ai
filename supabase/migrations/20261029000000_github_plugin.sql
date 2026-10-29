-- GitHub plugin: one encrypted connection per user plus a per-user repository
-- allowlist. The browser never reads these tables; only server routes using the
-- service role do, after authenticating the user.
create table if not exists public.github_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  github_login text not null check (char_length(github_login) <= 100),
  github_user_id bigint null,
  auth_kind text not null check (auth_kind in ('oauth', 'pat')),
  token_ciphertext text not null check (char_length(token_ciphertext) <= 4000),
  scopes text not null default '' check (char_length(scopes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.github_repo_access (
  user_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null check (full_name ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$' and char_length(full_name) <= 200),
  default_branch text not null default 'main' check (char_length(default_branch) <= 200),
  created_at timestamptz not null default now(),
  primary key (user_id, full_name)
);

create index if not exists github_repo_access_user_idx
  on public.github_repo_access (user_id, created_at);

alter table public.github_connections enable row level security;
alter table public.github_repo_access enable row level security;
revoke all on table public.github_connections from anon, authenticated;
revoke all on table public.github_repo_access from anon, authenticated;
grant all on table public.github_connections to service_role;
grant all on table public.github_repo_access to service_role;
