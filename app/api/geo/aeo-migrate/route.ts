import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";

export async function GET() {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(url, key);

  // aeo_keywords 테이블 체크
  const { error: kwErr } = await supabase.from("aeo_keywords").select("id").limit(1);
  // aeo_check_runs 테이블 체크
  const { error: runErr } = await supabase.from("aeo_check_runs").select("id").limit(1);

  const missing: string[] = [];
  if (kwErr?.code === "PGRST205" || kwErr?.code === "42P01") missing.push("aeo_keywords");
  if (runErr?.code === "PGRST205" || runErr?.code === "42P01") missing.push("aeo_check_runs");

  if (missing.length === 0) {
    return NextResponse.json({ ok: true, message: "테이블 이미 존재" });
  }

  return NextResponse.json({
    error: "테이블이 없습니다. Supabase Dashboard SQL Editor에서 아래 SQL을 실행하세요.",
    sql: `
-- AEO 키워드 테이블
CREATE TABLE IF NOT EXISTS aeo_keywords (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id uuid REFERENCES geo_brands(id) ON DELETE CASCADE,
  keyword text NOT NULL,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- AEO 체크 결과 테이블
CREATE TABLE IF NOT EXISTS aeo_check_runs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id uuid REFERENCES geo_brands(id) ON DELETE CASCADE,
  platform text NOT NULL DEFAULT 'google',
  total_keywords int DEFAULT 0,
  cited_count int DEFAULT 0,
  score int DEFAULT 0,
  results jsonb,
  created_at timestamptz DEFAULT now()
);

-- RLS 비활성화 (서비스 키로만 접근)
ALTER TABLE aeo_keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE aeo_check_runs ENABLE ROW LEVEL SECURITY;

-- 서비스 키 전체 접근 정책
CREATE POLICY "service_all_aeo_keywords" ON aeo_keywords FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all_aeo_check_runs" ON aeo_check_runs FOR ALL USING (true) WITH CHECK (true);
    `.trim(),
    missing,
  }, { status: 500 });
}
