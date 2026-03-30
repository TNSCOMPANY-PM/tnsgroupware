alter table public.clients
  add column if not exists status text default '활성',
  add column if not exists next_contact_at date;
