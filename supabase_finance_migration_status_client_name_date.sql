-- ============================================================
-- finance 테이블: status, client_name, date 컬럼 추가
-- Supabase SQL Editor에서 전체 복사 후 [Run] 실행.
-- ============================================================

-- 1) status: 'pending' | 'completed', 기본값 'pending'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'finance' AND column_name = 'status'
  ) THEN
    ALTER TABLE public.finance
      ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';
    COMMENT ON COLUMN public.finance.status IS '승인 상태: pending(승인대기), completed(정산완료)';
  END IF;
END $$;

-- 2) client_name: 고객사명 (파싱된 입금자 등)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'finance' AND column_name = 'client_name'
  ) THEN
    ALTER TABLE public.finance
      ADD COLUMN client_name TEXT;
    COMMENT ON COLUMN public.finance.client_name IS '고객사명 (SMS 파싱 입금자 등)';
  END IF;
END $$;

-- 3) date: 거래일 (YYYY-MM-DD). 기존 행은 NULL 허용
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'finance' AND column_name = 'date'
  ) THEN
    ALTER TABLE public.finance
      ADD COLUMN date TEXT;
    COMMENT ON COLUMN public.finance.date IS '거래일 (YYYY-MM-DD)';
  END IF;
END $$;

-- 4) 웹훅에서 입금 건 INSERT 허용 (서버가 anon 키로 호출 시)
DROP POLICY IF EXISTS "anon_insert_finance" ON public.finance;
CREATE POLICY "anon_insert_finance"
  ON public.finance FOR INSERT
  TO anon
  WITH CHECK (true);

-- 5) 웹훅/클라이언트에서 status 등 UPDATE 허용 (승인 시)
DROP POLICY IF EXISTS "anon_update_finance" ON public.finance;
CREATE POLICY "anon_update_finance"
  ON public.finance FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);
