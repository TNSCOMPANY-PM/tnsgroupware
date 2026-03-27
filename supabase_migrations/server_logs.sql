-- 서버 로그 영구 저장 테이블
CREATE TABLE IF NOT EXISTS public.server_logs (
  id          bigserial PRIMARY KEY,
  level       text NOT NULL CHECK (level IN ('info', 'warn', 'error')),
  message     text NOT NULL,
  detail      jsonb,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS server_logs_created_at_idx ON public.server_logs (created_at DESC);

-- RLS 비활성화 (서버 전용, service role만 사용)
ALTER TABLE public.server_logs DISABLE ROW LEVEL SECURITY;
