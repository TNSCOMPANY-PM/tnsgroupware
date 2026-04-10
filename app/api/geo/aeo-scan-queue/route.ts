import { createAdminClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";

/**
 * AEO 실제 브라우저 스캔 큐
 *
 * Playwright 스캐너는 Vercel 서버리스에서 실행 불가 (browser 미설치).
 * 로컬 Windows 머신의 작업 스케줄러 / 수동 실행 스크립트가
 * 이 큐를 폴링해서 pending 요청을 처리한다.
 *
 * 흐름:
 * 1. 사용자가 frandoor 페이지에서 "실제 스캔" 버튼 클릭
 * 2. 이 API가 aeo_scan_queue 테이블에 pending row 추가
 * 3. 로컬 워커(scripts/aeo-scan-worker.ts) 또는 작업 스케줄러가
 *    주기적으로 pending 큐를 확인하고 scripts/aeo-scan.ts 실행
 * 4. 결과는 기존 aeo_check_runs 테이블에 저장됨
 * 5. UI는 기존 /api/geo/aeo-check?type=history 로 결과 조회
 */

// POST: 스캔 요청 큐에 등록
export async function POST(request: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const body = await request.json() as {
    brand_id: string;
    platform: "google" | "naver" | "both";
  };

  if (!body.brand_id) {
    return NextResponse.json({ error: "brand_id required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // 브랜드 존재 확인
  const { data: brand } = await supabase
    .from("geo_brands")
    .select("id, name")
    .eq("id", body.brand_id)
    .maybeSingle();

  if (!brand) {
    return NextResponse.json({ error: "브랜드 없음" }, { status: 404 });
  }

  // 이미 pending/running 작업이 있는지 확인
  const { data: existing } = await supabase
    .from("aeo_scan_queue")
    .select("id, status")
    .eq("brand_id", body.brand_id)
    .in("status", ["pending", "running"])
    .maybeSingle();

  if (existing) {
    return NextResponse.json({
      queued: false,
      already_running: true,
      status: existing.status,
      message: "이미 진행 중인 스캔이 있습니다",
    });
  }

  // 큐 등록
  const { data: queueRow, error } = await supabase
    .from("aeo_scan_queue")
    .insert({
      brand_id: body.brand_id,
      platform: body.platform ?? "both",
      status: "pending",
      requested_by: String(session.employeeId),
    })
    .select()
    .single();

  if (error) {
    // 테이블 없을 수도 있음 — 스키마 가이드 반환
    if (error.code === "PGRST205" || error.code === "42P01") {
      return NextResponse.json({
        error: "aeo_scan_queue 테이블이 없습니다. Supabase SQL Editor에서 아래 SQL 실행.",
        sql: `
CREATE TABLE IF NOT EXISTS aeo_scan_queue (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id uuid REFERENCES geo_brands(id) ON DELETE CASCADE,
  platform text NOT NULL DEFAULT 'both',
  status text NOT NULL DEFAULT 'pending',
  requested_by text,
  started_at timestamptz,
  finished_at timestamptz,
  error_message text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE aeo_scan_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_all_aeo_scan_queue" ON aeo_scan_queue FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_aeo_scan_queue_status ON aeo_scan_queue(status, created_at);
        `.trim(),
      }, { status: 500 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    queued: true,
    queue_id: queueRow.id,
    brand: brand.name,
    platform: body.platform ?? "both",
    message: "스캔이 큐에 등록됐습니다. 로컬 워커가 처리합니다 (수 분 소요).",
  });
}

// GET: 큐 상태 조회
export async function GET(request: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const { searchParams } = new URL(request.url);
  const brandId = searchParams.get("brand_id");
  if (!brandId) return NextResponse.json({ error: "brand_id required" }, { status: 400 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("aeo_scan_queue")
    .select("*")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    if (error.code === "PGRST205" || error.code === "42P01") return NextResponse.json([]);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data ?? []);
}
