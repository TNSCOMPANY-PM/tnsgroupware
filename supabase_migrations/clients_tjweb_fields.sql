alter table public.clients
  add column if not exists emails text[] default '{}',
  add column if not exists contacts text[] default '{}',
  add column if not exists hosting_type text,
  add column if not exists hosting_expires_at date,
  add column if not exists domain_expires_at date,
  add column if not exists ssl_expires_at date;
