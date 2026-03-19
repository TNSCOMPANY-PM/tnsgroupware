-- ============================================================
-- TNS Workspace · 칸반 보드(kanban_cards) 테이블
-- Supabase SQL Editor에서 실행하세요.
-- (칸반 보드가 작동하지 않으면 이 파일 전체를 실행하세요.)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.kanban_cards (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title       text NOT NULL,
  description text,
  "column"    text NOT NULL DEFAULT 'todo',
  position    integer NOT NULL DEFAULT 0,
  assignee    text,
  priority    text,
  due_date    date,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE public.kanban_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS anon_select_kanban ON public.kanban_cards;
DROP POLICY IF EXISTS anon_insert_kanban ON public.kanban_cards;
DROP POLICY IF EXISTS anon_update_kanban ON public.kanban_cards;
DROP POLICY IF EXISTS anon_delete_kanban ON public.kanban_cards;

CREATE POLICY anon_select_kanban ON public.kanban_cards FOR SELECT TO anon USING (true);
CREATE POLICY anon_insert_kanban ON public.kanban_cards FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY anon_update_kanban ON public.kanban_cards FOR UPDATE TO anon USING (true);
CREATE POLICY anon_delete_kanban ON public.kanban_cards FOR DELETE TO anon USING (true);
