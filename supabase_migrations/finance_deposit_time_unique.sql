-- finance 테이블에 deposit_time 컬럼 추가 + 중복 방지 unique index
-- Supabase SQL Editor에서 실행하세요.

-- 1. deposit_time 컬럼 추가 (nullable)
ALTER TABLE finance ADD COLUMN IF NOT EXISTS deposit_time TEXT;

-- 2. 기존 데이터에서 description의 t:HH:MM 태그로 backfill
UPDATE finance
SET deposit_time = (regexp_match(description, 't:(\d{2}:\d{2})'))[1]
WHERE deposit_time IS NULL AND description IS NOT NULL;

-- 3. (date, amount, type, deposit_time) unique index (time 있는 건만)
CREATE UNIQUE INDEX IF NOT EXISTS finance_deposit_unique
ON finance(date, amount, type, deposit_time)
WHERE deposit_time IS NOT NULL;
