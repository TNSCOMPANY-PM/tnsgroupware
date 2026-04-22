-- GEO V2 — canonical payload 저장소 (syndicate 원본 소스)
-- 2026-04-22

create table if not exists geo_canonical (
  id uuid primary key default gen_random_uuid(),
  canonical_url text unique not null,
  depth text not null check (depth in ('D0','D1','D2','D3')),
  brand_id uuid references geo_brands(id),
  industry text,
  slug text,
  payload jsonb not null,
  tiers jsonb not null,
  facts_raw jsonb not null,
  json_ld jsonb not null,
  lint_result jsonb,
  pipeline_version text not null default 'v2',
  generated_at timestamptz default now()
);

create index if not exists idx_geo_canonical_depth on geo_canonical(depth);
create index if not exists idx_geo_canonical_brand_id on geo_canonical(brand_id);
create index if not exists idx_geo_canonical_industry on geo_canonical(industry);
