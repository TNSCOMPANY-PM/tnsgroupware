create table if not exists public.finance_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz default now()
);
