-- 비품구입 템플릿 (전체 공유) 테이블
-- Supabase 대시보드 → SQL Editor에서 실행하세요.

create table if not exists approval_purchase_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  title text not null default '',
  purchase_url text not null default '',
  purchase_id text not null default '',
  purchase_password text not null default '',
  item_name text not null default '',
  purpose text not null default '',
  created_at timestamptz not null default now()
);

alter table approval_purchase_templates enable row level security;

create policy "Allow read for authenticated"
  on approval_purchase_templates for select to authenticated using (true);
create policy "Allow insert for authenticated"
  on approval_purchase_templates for insert to authenticated with check (true);
create policy "Allow update for authenticated"
  on approval_purchase_templates for update to authenticated using (true);
create policy "Allow delete for authenticated"
  on approval_purchase_templates for delete to authenticated using (true);

create policy "Allow read for anon"
  on approval_purchase_templates for select to anon using (true);
create policy "Allow insert for anon"
  on approval_purchase_templates for insert to anon with check (true);
create policy "Allow update for anon"
  on approval_purchase_templates for update to anon using (true);
create policy "Allow delete for anon"
  on approval_purchase_templates for delete to anon using (true);
