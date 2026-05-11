-- v5-03 — frandoor_blog_schedules.status CHECK 확장 (등록 즉시 generation 백그라운드 흐름).
-- ⚠️ 사용자 직접 실행.
--
-- 추가 상태:
--   'generating' : Actions Runner 가 generation 중 (lock)
--   'ready'      : draft 완성, 발행 시각 도래 대기
--   'publishing' : Actions Runner 가 commit 중 (lock)
--
-- 기존 상태 ('pending', 'running', 'published', 'failed', 'canceled') 도 유지.
-- 'running' 은 v5-01 호환 (v5-03 흐름에서는 미사용).

BEGIN;

ALTER TABLE frandoor_blog_schedules
  DROP CONSTRAINT IF EXISTS frandoor_blog_schedules_status_check;

ALTER TABLE frandoor_blog_schedules
  ADD CONSTRAINT frandoor_blog_schedules_status_check
  CHECK (status IN (
    'pending',
    'generating',
    'ready',
    'publishing',
    'published',
    'failed',
    'canceled',
    'running'
  ));

COMMIT;
