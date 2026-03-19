-- 팀장 레벨: 김동균, 박재민, 김정섭
-- 김정섭 팀장 소속(사원): 김용준, 심규성
-- Supabase 대시보드 → SQL Editor에서 실행하세요.

UPDATE public.employees SET role = '팀장'
WHERE name IN ('김동균', '박재민', '김정섭');

UPDATE public.employees SET role = '사원'
WHERE name IN ('김용준', '심규성');
