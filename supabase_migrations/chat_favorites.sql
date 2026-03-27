create table if not exists chat_favorites (
  user_id uuid primary key,
  items text[] not null default '{}',
  updated_at timestamptz default now()
);
