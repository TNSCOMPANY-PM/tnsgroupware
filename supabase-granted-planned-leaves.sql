-- =============================================
-- 특별 부여 연차 (granted_leaves)
-- =============================================
CREATE TABLE IF NOT EXISTS granted_leaves (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  user_name text NOT NULL,
  year int NOT NULL,
  days numeric NOT NULL,
  type text NOT NULL,
  reason text,
  granted_at timestamptz DEFAULT now()
);

ALTER TABLE granted_leaves ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_granted_leaves" ON granted_leaves;
CREATE POLICY "allow_all_granted_leaves" ON granted_leaves USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_granted_leaves_user_year ON granted_leaves(user_id, year);

-- =============================================
-- 연차 사용 계획 (planned_leaves)
-- =============================================
CREATE TABLE IF NOT EXISTS planned_leaves (
  id text PRIMARY KEY,
  applicant_id text NOT NULL,
  applicant_name text NOT NULL,
  applicant_department text NOT NULL,
  leave_type text NOT NULL DEFAULT 'annual',
  start_date date NOT NULL,
  end_date date NOT NULL,
  days numeric NOT NULL,
  reason text NOT NULL DEFAULT '연차 사용 계획 제출',
  status text NOT NULL DEFAULT 'PLANNED',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE planned_leaves ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_planned_leaves" ON planned_leaves;
CREATE POLICY "allow_all_planned_leaves" ON planned_leaves USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_planned_leaves_applicant ON planned_leaves(applicant_id);
