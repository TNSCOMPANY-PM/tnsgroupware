-- AEO 스캔 큐 테이블
-- Playwright 기반 실제 브라우저 스캔은 Vercel 서버리스에서 실행 불가
-- 로컬 Windows 워커(scripts/aeo-scan-worker.ts)가 이 큐를 폴링해서 처리

CREATE TABLE IF NOT EXISTS aeo_scan_queue (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id uuid REFERENCES geo_brands(id) ON DELETE CASCADE,
  platform text NOT NULL DEFAULT 'both',  -- 'google' | 'naver' | 'both'
  status text NOT NULL DEFAULT 'pending',  -- 'pending' | 'running' | 'done' | 'failed'
  requested_by text,
  started_at timestamptz,
  finished_at timestamptz,
  error_message text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE aeo_scan_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_all_aeo_scan_queue"
  ON aeo_scan_queue FOR ALL
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_aeo_scan_queue_status
  ON aeo_scan_queue(status, created_at);

CREATE INDEX IF NOT EXISTS idx_aeo_scan_queue_brand
  ON aeo_scan_queue(brand_id, created_at DESC);
