-- 간단 정산 템플릿 (전체 공유) 테이블
-- Supabase 대시보드 → SQL Editor에서 실행하세요.

create table if not exists approval_settlement_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  title text not null default '',
  payment_reason text not null default '',
  sheet_classification text not null default '',
  bank text not null default '',
  account_number text not null default '',
  account_holder_name text not null default '',
  attachment_note text not null default '',
  created_at timestamptz not null default now()
);

-- RLS: API는 Next.js에서만 호출(앱 로그인으로 보호)되므로 anon·authenticated 모두 허용
alter table approval_settlement_templates enable row level security;

drop policy if exists "Allow read for authenticated" on approval_settlement_templates;
drop policy if exists "Allow insert for authenticated" on approval_settlement_templates;
drop policy if exists "Allow update for authenticated" on approval_settlement_templates;
drop policy if exists "Allow delete for authenticated" on approval_settlement_templates;
drop policy if exists "Allow read for anon" on approval_settlement_templates;
drop policy if exists "Allow insert for anon" on approval_settlement_templates;
drop policy if exists "Allow update for anon" on approval_settlement_templates;
drop policy if exists "Allow delete for anon" on approval_settlement_templates;

-- authenticated (Supabase 로그인 세션이 있을 때)
create policy "Allow read for authenticated"
  on approval_settlement_templates for select to authenticated using (true);
create policy "Allow insert for authenticated"
  on approval_settlement_templates for insert to authenticated with check (true);
create policy "Allow update for authenticated"
  on approval_settlement_templates for update to authenticated using (true);
create policy "Allow delete for authenticated"
  on approval_settlement_templates for delete to authenticated using (true);

-- anon (그룹웨어만 로그인하고 Supabase 세션 없을 때도 동작하도록)
create policy "Allow read for anon"
  on approval_settlement_templates for select to anon using (true);
create policy "Allow insert for anon"
  on approval_settlement_templates for insert to anon with check (true);
create policy "Allow update for anon"
  on approval_settlement_templates for update to anon using (true);
create policy "Allow delete for anon"
  on approval_settlement_templates for delete to anon using (true);
