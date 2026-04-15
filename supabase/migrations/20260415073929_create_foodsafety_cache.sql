-- 식약처 식품안전나라 OpenAPI 응답 캐시. TTL 24시간.
-- 일 호출량 제한 회피 + 재판매 금지 조항 대응 (내부 저장만).
CREATE TABLE IF NOT EXISTS foodsafety_cache (
  cache_key TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_foodsafety_cache_fetched_at
  ON foodsafety_cache (fetched_at DESC);
