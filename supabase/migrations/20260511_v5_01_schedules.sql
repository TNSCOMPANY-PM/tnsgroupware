-- v5-01 — 예약 발행 자동화: frandoor_blog_schedules 테이블 신규.
-- TNS supabase, public.frandoor_blog_schedules.
--
-- ⚠️ 사용자 직접 실행.
-- 상태 전이:
--   pending → running → published
--                ↓
--              failed (retry_count++ < 1 이면 pending 재진입, 그 외 failed 종료)
--   pending → canceled (사용자 취소)

BEGIN;

CREATE TABLE IF NOT EXISTS frandoor_blog_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  industry text NOT NULL,
  topic text,
  scheduled_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  draft_id uuid REFERENCES frandoor_blog_drafts(id),
  retry_count int NOT NULL DEFAULT 0,
  error_msg text,
  published_url text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT frandoor_blog_schedules_status_check CHECK (
    status IN ('pending', 'running', 'published', 'failed', 'canceled')
  )
);

CREATE INDEX IF NOT EXISTS idx_schedules_status_at
  ON frandoor_blog_schedules (status, scheduled_at);

COMMIT;
