-- approvals 테이블에 finance_date 컬럼 추가
ALTER TABLE public.approvals ADD COLUMN IF NOT EXISTS finance_date date;

COMMENT ON COLUMN public.approvals.finance_date IS '원장 기록 날짜 (결재 신청 시 지정, 기본값: 신청일)';
