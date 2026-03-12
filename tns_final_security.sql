-- ============================================================
-- TNS Workspace · 프로덕션 보안 정책 (RLS + Storage)
-- Supabase 대시보드 → SQL Editor에서 실행하세요.
-- 이미 같은 이름의 정책이 있으면 "already exists" 오류가 납니다. 그때는 DROP POLICY 후 재실행하세요.
-- ============================================================

-- 0. employees 테이블에 프로필 사진 URL 컬럼 추가 (없을 경우)
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS avatar_url TEXT;
COMMENT ON COLUMN public.employees.avatar_url IS 'Supabase Storage avatars 버킷 공개 URL';

-- 1. RLS 활성화
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance ENABLE ROW LEVEL SECURITY;

-- 2. 정책: 로그인한 사용자(Authenticated)만 조회·수정·삽입·삭제 가능
-- employees
CREATE POLICY "authenticated_all_employees"
  ON public.employees FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- projects
CREATE POLICY "authenticated_all_projects"
  ON public.projects FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- leaves
CREATE POLICY "authenticated_all_leaves"
  ON public.leaves FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- finance
CREATE POLICY "authenticated_all_finance"
  ON public.finance FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 3. anon(비로그인)에서 로그인/시드용 함수는 이미 SECURITY DEFINER로 허용됨.
--    필요 시 서비스 역할로만 직원 생성 등 제한하려면 별도 정책 추가.

-- 4. Storage 버킷 생성 (Supabase Storage 스키마 사용)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('avatars', 'avatars', true, 2097152, ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']),
  ('documents', 'documents', true, 10485760, NULL)
ON CONFLICT (id) DO NOTHING;

-- 5. Storage 정책: 로그인 사용자는 avatars, documents 버킷에 업로드·조회 가능
CREATE POLICY "authenticated_avatars_upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'avatars');

CREATE POLICY "authenticated_avatars_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'avatars');

CREATE POLICY "authenticated_documents_upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'documents');

CREATE POLICY "authenticated_documents_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'documents');

-- 공개 버킷이므로 anon도 SELECT 허용 (프로필 사진 공개 링크용)
CREATE POLICY "anon_avatars_select"
  ON storage.objects FOR SELECT
  TO anon
  USING (bucket_id = 'avatars');

CREATE POLICY "anon_documents_select"
  ON storage.objects FOR SELECT
  TO anon
  USING (bucket_id = 'documents');
