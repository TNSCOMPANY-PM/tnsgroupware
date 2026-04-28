-- v2-10 ftc 9,552 brand = main universe (architectural pivot)
-- 적용: frandoor supabase project (felaezeqnoskkowoqsja)
--
-- 변경 의미:
--   brand_facts.brand_id 의 의미가 geo_brands.id (89 우리 고객) → ftc_brands_2024.id (UUID, 9552 ftc brand) 로 바뀜.
--   Type 은 UUID 그대로 (옵션 A) — schema ALTER 불필요, 기존 row 만 폐기하고 재적재.
--
-- 안전성:
--   ftc_brands_2024 read-only (DELETE/ALTER 없음).
--   industry_facts 는 LLM1 batch 가 재집계.

-- 1. brand_facts 기존 row 폐기 (LLM1 batch 가 ftc PK 기준으로 재적재)
DELETE FROM brand_facts;

-- 2. industry_facts 기존 row 폐기 (LLM1 batch 가 재집계)
DELETE FROM industry_facts;
