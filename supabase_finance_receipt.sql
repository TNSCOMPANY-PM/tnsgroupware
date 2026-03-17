-- finance 테이블에 receipt_data JSONB 컬럼 추가
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'finance' AND column_name = 'receipt_data'
  ) THEN
    ALTER TABLE public.finance ADD COLUMN receipt_data jsonb;
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
