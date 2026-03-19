-- ============================================================
-- finance 테이블 완전 설정 (컬럼 추가 + RLS 정책)
-- Supabase SQL Editor에서 전체 복사 후 [Run] 실행.
-- 이미 있는 컬럼/정책은 안전하게 무시합니다.
-- ============================================================

-- 1. status 컬럼 (pending / completed)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='finance' AND column_name='status'
  ) THEN
    ALTER TABLE public.finance ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';
    COMMENT ON COLUMN public.finance.status IS '승인 상태: pending(대기), completed(완료)';
  END IF;
END $$;

-- 2. client_name 컬럼 (고객사/입금자명)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='finance' AND column_name='client_name'
  ) THEN
    ALTER TABLE public.finance ADD COLUMN client_name TEXT;
    COMMENT ON COLUMN public.finance.client_name IS '고객사명 또는 입금자명';
  END IF;
END $$;

-- 3. date 컬럼 (거래일, YYYY-MM-DD)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='finance' AND column_name='date'
  ) THEN
    ALTER TABLE public.finance ADD COLUMN date TEXT;
    COMMENT ON COLUMN public.finance.date IS '거래일 YYYY-MM-DD';
  END IF;
END $$;

-- 4. description 컬럼 (description이 아직 없는 경우)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='finance' AND column_name='description'
  ) THEN
    ALTER TABLE public.finance ADD COLUMN description TEXT;
  END IF;
END $$;

-- 4-1. receipt_data 컬럼 (영수증/세금계산서 정보 JSON)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='finance' AND column_name='receipt_data'
  ) THEN
    ALTER TABLE public.finance ADD COLUMN receipt_data jsonb;
    COMMENT ON COLUMN public.finance.receipt_data IS '영수증/세금계산서 입력 데이터 (JSON)';
  END IF;
END $$;

-- 5. RLS 활성화
ALTER TABLE public.finance ENABLE ROW LEVEL SECURITY;

-- 6. anon SELECT
DROP POLICY IF EXISTS "anon_select_finance" ON public.finance;
CREATE POLICY "anon_select_finance"
  ON public.finance FOR SELECT TO anon USING (true);

-- 7. anon INSERT (웹훅·동기화 API가 anon 키로 INSERT)
DROP POLICY IF EXISTS "anon_insert_finance" ON public.finance;
CREATE POLICY "anon_insert_finance"
  ON public.finance FOR INSERT TO anon WITH CHECK (true);

-- 8. anon UPDATE (승인 처리)
DROP POLICY IF EXISTS "anon_update_finance" ON public.finance;
CREATE POLICY "anon_update_finance"
  ON public.finance FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- 8-1. anon DELETE (통합 원장 개별 삭제)
DROP POLICY IF EXISTS "anon_delete_finance" ON public.finance;
CREATE POLICY "anon_delete_finance"
  ON public.finance FOR DELETE TO anon USING (true);

-- 9. authenticated 전체 권한
DROP POLICY IF EXISTS "authenticated_all_finance" ON public.finance;
CREATE POLICY "authenticated_all_finance"
  ON public.finance FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 확인 쿼리 (실행 후 결과 보기)
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'finance'
ORDER BY ordinal_position;
