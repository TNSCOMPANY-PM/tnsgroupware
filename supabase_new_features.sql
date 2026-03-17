-- ============================================================
-- TNS Workspace - 칸반 / 캘린더 / 전자결재 테이블 생성
-- Supabase SQL Editor에서 실행하세요
-- ============================================================

-- ── 1. 칸반 보드 ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.kanban_cards (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title       text NOT NULL,
  description text,
  column      text NOT NULL DEFAULT 'todo',   -- todo | in_progress | review | done
  position    integer NOT NULL DEFAULT 0,
  assignee    text,
  priority    text,                            -- high | medium | low
  due_date    date,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE public.kanban_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY anon_select_kanban ON public.kanban_cards FOR SELECT TO anon USING (true);
CREATE POLICY anon_insert_kanban ON public.kanban_cards FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY anon_update_kanban ON public.kanban_cards FOR UPDATE TO anon USING (true);
CREATE POLICY anon_delete_kanban ON public.kanban_cards FOR DELETE TO anon USING (true);

-- ── 2. 캘린더 일정 ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.calendar_events (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title         text NOT NULL,
  description   text,
  start_date    date NOT NULL,
  end_date      date,
  all_day       boolean DEFAULT true,
  color         text DEFAULT 'blue',
  author_name   text,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY anon_select_events ON public.calendar_events FOR SELECT TO anon USING (true);
CREATE POLICY anon_insert_events ON public.calendar_events FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY anon_update_events ON public.calendar_events FOR UPDATE TO anon USING (true);
CREATE POLICY anon_delete_events ON public.calendar_events FOR DELETE TO anon USING (true);

-- ── 3. 전자결재 ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.approvals (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  type            text NOT NULL DEFAULT 'etc',   -- leave | expense | overtime | purchase | etc
  title           text NOT NULL,
  content         text,
  requester_name  text NOT NULL,
  requester_id    text NOT NULL,
  approver_name   text,
  status          text NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  reject_reason   text,
  amount          numeric,
  start_date      date,
  end_date        date,
  created_at      timestamptz DEFAULT now(),
  reviewed_at     timestamptz
);

ALTER TABLE public.approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY anon_select_approvals ON public.approvals FOR SELECT TO anon USING (true);
CREATE POLICY anon_insert_approvals ON public.approvals FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY anon_update_approvals ON public.approvals FOR UPDATE TO anon USING (true);
CREATE POLICY anon_delete_approvals ON public.approvals FOR DELETE TO anon USING (true);
