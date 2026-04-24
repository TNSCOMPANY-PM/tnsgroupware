/**
 * Public Fact 수집 라우트 — DEPRECATED (PR030 hotfix).
 *
 * 공정위 OpenAPI 기반 자동 수집은 폐기. 공정위 정보공개서는 프랜도어 업로드(HTML/엑셀)로
 * `frandoor_ftc_facts` 테이블에 적재되는 단일 경로로 통일.
 *
 * 기존 라우트는 fetchFtcFactByBrandName / findBrandFrcsStat / ftcContent 를 사용했으나
 * FTC OpenAPI 자체가 "해당 연도 등록 기준치" 를 반환할 뿐이어서 라벨이 "가맹점수" 인 것은
 * 현 운영수와 무관했음 (오공김밥 2024 등록 시 frcsCnt=4 == newFrcsRgsCnt=4 사례 참조).
 */
import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";

export async function POST() {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();
  return NextResponse.json(
    {
      error: "DEPRECATED",
      message: "공정위 OpenAPI 수동 수집은 폐기되었습니다. 정보공개서는 프랜도어 업로드(HTML/엑셀)로 frandoor_ftc_facts 에 적재됩니다.",
    },
    { status: 410 },
  );
}

export async function GET() {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();
  return NextResponse.json({ error: "DEPRECATED" }, { status: 410 });
}
