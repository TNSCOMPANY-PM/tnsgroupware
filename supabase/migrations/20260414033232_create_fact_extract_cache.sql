-- 파일 해시 기반 팩트 추출 결과 캐시.
-- 같은 파일(같은 SHA-256) 재업로드 시 GPT 재호출 없이 재사용.
CREATE TABLE IF NOT EXISTS fact_extract_cache (
  file_hash TEXT PRIMARY KEY,
  file_name TEXT,
  facts JSONB NOT NULL,
  raw_text TEXT,
  official_data JSONB,
  chunks_processed INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fact_extract_cache_created_at
  ON fact_extract_cache (created_at DESC);
