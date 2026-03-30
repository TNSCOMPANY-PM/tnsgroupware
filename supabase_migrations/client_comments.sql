create table if not exists public.client_comments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete cascade,
  author_name text not null,
  content text not null,
  created_at timestamptz default now()
);
