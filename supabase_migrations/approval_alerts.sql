create table if not exists public.approval_alerts (
  id uuid primary key default gen_random_uuid(),
  target_user_id text not null,
  approval_id uuid references public.approvals(id) on delete cascade,
  approval_title text not null,
  requester_name text not null,
  created_at timestamptz default now(),
  is_done boolean default false
);
