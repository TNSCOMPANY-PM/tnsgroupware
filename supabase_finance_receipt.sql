-- finance 테이블에 receipt_data JSONB 컬럼 추가 (영수증/세금계산서 정보 저장)
-- Supabase SQL Editor에서 이 파일 내용 복사 후 [Run] 실행.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'finance' AND column_name = 'receipt_data'
  ) THEN
    ALTER TABLE public.finance ADD COLUMN receipt_data jsonb;
    COMMENT ON COLUMN public.finance.receipt_data IS '영수증/세금계산서 입력 데이터 (JSON)';
  END IF;
END $$;

-- anon 역할에 UPDATE 허용 (receipt_data 저장용)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'finance' AND policyname = 'anon_update_finance'
  ) THEN
    CREATE POLICY "anon_update_finance" ON public.finance
      FOR UPDATE TO anon USING (true) WITH CHECK (true);
  END IF;
END $$;
