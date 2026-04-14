-- 증명서 발행 이력
CREATE TABLE IF NOT EXISTS certificate_issuances (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id text NOT NULL,
  employee_name text NOT NULL,
  certificate_type text NOT NULL, -- 'employment' | 'career'
  purpose text,
  language text DEFAULT 'ko',
  seal_type text DEFAULT 'digital', -- 'digital' | 'physical'
  memo text,
  issued_by_id text,
  issued_by_name text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE certificate_issuances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_all_cert_issuances" ON certificate_issuances FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_cert_issuances_employee ON certificate_issuances(employee_id, created_at DESC);
