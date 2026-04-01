-- ============================================================
-- RLS: anon 접근 차단 → authenticated 사용자만 허용
-- Supabase SQL Editor에서 실행하세요.
-- ============================================================

-- 1. employees
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_employees" ON employees;
DROP POLICY IF EXISTS "authenticated_all_employees" ON employees;
CREATE POLICY "authenticated_all_employees" ON employees
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 2. approvals
ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_approvals" ON approvals;
DROP POLICY IF EXISTS "authenticated_all_approvals" ON approvals;
CREATE POLICY "authenticated_all_approvals" ON approvals
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3. finance
ALTER TABLE finance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_finance" ON finance;
DROP POLICY IF EXISTS "authenticated_all_finance" ON finance;
CREATE POLICY "authenticated_all_finance" ON finance
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 4. finance_settings
ALTER TABLE finance_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all_finance_settings" ON finance_settings;
CREATE POLICY "authenticated_all_finance_settings" ON finance_settings
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 5. ledger_custom_entries
ALTER TABLE ledger_custom_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all_ledger_custom" ON ledger_custom_entries;
CREATE POLICY "authenticated_all_ledger_custom" ON ledger_custom_entries
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 6. clients
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_clients" ON clients;
DROP POLICY IF EXISTS "authenticated_all_clients" ON clients;
CREATE POLICY "authenticated_all_clients" ON clients
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 7. leave_requests
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_leaves" ON leave_requests;
DROP POLICY IF EXISTS "authenticated_all_leaves" ON leave_requests;
CREATE POLICY "authenticated_all_leaves" ON leave_requests
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 8. calendar_events
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all_events" ON calendar_events;
CREATE POLICY "authenticated_all_events" ON calendar_events
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 9. announcements
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_announcements" ON announcements;
DROP POLICY IF EXISTS "authenticated_all_announcements" ON announcements;
CREATE POLICY "authenticated_all_announcements" ON announcements
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 10. approval_alerts
ALTER TABLE approval_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all_approval_alerts" ON approval_alerts;
CREATE POLICY "authenticated_all_approval_alerts" ON approval_alerts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 11. roadmap_data
ALTER TABLE roadmap_data ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all_roadmap" ON roadmap_data;
CREATE POLICY "authenticated_all_roadmap" ON roadmap_data
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 12. assets
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all_assets" ON assets;
CREATE POLICY "authenticated_all_assets" ON assets
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 13. contracts
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all_contracts" ON contracts;
CREATE POLICY "authenticated_all_contracts" ON contracts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 14. kanban_tasks (있는 경우)
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'kanban_tasks') THEN
    ALTER TABLE kanban_tasks ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "authenticated_all_kanban" ON kanban_tasks;
    CREATE POLICY "authenticated_all_kanban" ON kanban_tasks
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 15. granted_leaves / planned_leaves (있는 경우)
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'granted_leaves') THEN
    ALTER TABLE granted_leaves ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "authenticated_all_granted_leaves" ON granted_leaves;
    CREATE POLICY "authenticated_all_granted_leaves" ON granted_leaves
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'planned_leaves') THEN
    ALTER TABLE planned_leaves ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "authenticated_all_planned_leaves" ON planned_leaves;
    CREATE POLICY "authenticated_all_planned_leaves" ON planned_leaves
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
