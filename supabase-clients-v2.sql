-- clients 테이블 컬럼 추가 (기존 테이블에 ALTER)
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS business_number TEXT,
  ADD COLUMN IF NOT EXISTS representative TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS business_type TEXT,
  ADD COLUMN IF NOT EXISTS business_item TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT;
