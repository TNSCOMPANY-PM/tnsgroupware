-- =============================================
-- HR 휴가 신청 테이블 (leave_requests)
-- =============================================

CREATE TABLE IF NOT EXISTS leave_requests (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  applicant_id text NOT NULL,
  applicant_name text NOT NULL,
  applicant_department text NOT NULL,
  leave_type text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  days numeric NOT NULL,
  reason text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT '팀장_1차_승인_대기',
  team_lead_approved_at timestamptz,
  c_level_approved_at timestamptz,
  rejected_at timestamptz,
  reject_reason text,
  requires_proof boolean DEFAULT false,
  proof_status text,
  proof_file_name text,
  proof_uploaded_at timestamptz,
  auto_approved boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_leave_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_leave_requests_updated_at ON leave_requests;
CREATE TRIGGER trg_leave_requests_updated_at
  BEFORE UPDATE ON leave_requests
  FOR EACH ROW EXECUTE FUNCTION update_leave_requests_updated_at();

-- RLS 활성화
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;

-- 모든 인증 사용자 읽기 허용
DROP POLICY IF EXISTS "allow_read_leave_requests" ON leave_requests;
CREATE POLICY "allow_read_leave_requests" ON leave_requests
  FOR SELECT USING (true);

-- 삽입 허용
DROP POLICY IF EXISTS "allow_insert_leave_requests" ON leave_requests;
CREATE POLICY "allow_insert_leave_requests" ON leave_requests
  FOR INSERT WITH CHECK (true);

-- 수정 허용 (승인/반려/취소 등)
DROP POLICY IF EXISTS "allow_update_leave_requests" ON leave_requests;
CREATE POLICY "allow_update_leave_requests" ON leave_requests
  FOR UPDATE USING (true);

-- 삭제 허용 (대기 중 취소)
DROP POLICY IF EXISTS "allow_delete_leave_requests" ON leave_requests;
CREATE POLICY "allow_delete_leave_requests" ON leave_requests
  FOR DELETE USING (true);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_leave_requests_applicant_id ON leave_requests(applicant_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_leave_requests_start_date ON leave_requests(start_date);
