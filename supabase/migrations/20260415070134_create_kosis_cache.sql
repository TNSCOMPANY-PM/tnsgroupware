-- KOSIS OpenAPI 응답 캐시. TTL 24시간.
-- 호출량 제한 회피 + 재판매 금지 조항 대응 (내부 캐시로만 보관).
CREATE TABLE IF NOT EXISTS kosis_cache (
  tbl_id TEXT NOT NULL,
  prd_de TEXT NOT NULL,
  payload JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tbl_id, prd_de)
);

CREATE INDEX IF NOT EXISTS idx_kosis_cache_fetched_at
  ON kosis_cache (fetched_at DESC);
