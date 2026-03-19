-- 정산요청 전용 컬럼 (시트 분류, 결제 사유, 은행/계좌, 첨부)
ALTER TABLE public.approvals ADD COLUMN IF NOT EXISTS sheet_classification text;
ALTER TABLE public.approvals ADD COLUMN IF NOT EXISTS payment_reason text;
ALTER TABLE public.approvals ADD COLUMN IF NOT EXISTS bank text;
ALTER TABLE public.approvals ADD COLUMN IF NOT EXISTS account_number text;
ALTER TABLE public.approvals ADD COLUMN IF NOT EXISTS account_holder_name text;
ALTER TABLE public.approvals ADD COLUMN IF NOT EXISTS attachment_note text;

COMMENT ON COLUMN public.approvals.sheet_classification IS '정산요청 시트 분류: 결제, 정산, 환불, 슬롯구입정산, CPC리워드';
COMMENT ON COLUMN public.approvals.payment_reason IS '결제 사유';
COMMENT ON COLUMN public.approvals.bank IS '은행';
COMMENT ON COLUMN public.approvals.account_number IS '계좌번호';
COMMENT ON COLUMN public.approvals.account_holder_name IS '예금주명';
COMMENT ON COLUMN public.approvals.attachment_note IS '첨부자료 메모 또는 URL (환불내역서, 세금계산서, 통장사본 등)';
