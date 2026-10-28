create index if not exists background_jobs_conversation_created_idx
  on public.background_jobs (conversation_id, user_id, created_at desc)
  where conversation_id is not null;

create index if not exists background_job_events_user_job_idx
  on public.background_job_events (user_id, job_id, id);
