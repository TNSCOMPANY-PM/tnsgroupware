-- 비품구입 전용 컬럼
ALTER TABLE public.approvals ADD COLUMN IF NOT EXISTS purchase_url text;
ALTER TABLE public.approvals ADD COLUMN IF NOT EXISTS purchase_id text;
ALTER TABLE public.approvals ADD COLUMN IF NOT EXISTS purchase_password text;
ALTER TABLE public.approvals ADD COLUMN IF NOT EXISTS item_name text;
ALTER TABLE public.approvals ADD COLUMN IF NOT EXISTS purpose text;

COMMENT ON COLUMN public.approvals.purchase_url IS '비품구입 구입처 URL';
COMMENT ON COLUMN public.approvals.purchase_id IS '비품구입 사이트 아이디';
COMMENT ON COLUMN public.approvals.purchase_password IS '비품구입 사이트 비밀번호';
COMMENT ON COLUMN public.approvals.item_name IS '비품구입 물품명';
COMMENT ON COLUMN public.approvals.purpose IS '비품구입 용도';
