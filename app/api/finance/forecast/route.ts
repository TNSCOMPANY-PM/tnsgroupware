import { createAdminClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";

/** 과거 3개월 매출 기반 이번 달 예측 마감 매출 */
export async function GET() {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const supabase = createAdminClient();
  const today = new Date();
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

  // 과거 3개월 키 계산
  const pastMonths: string[] = [];
  for (let i = 1; i <= 3; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    pastMonths.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  // 과거 3개월 매출 합계 조회
  const { data: pastRows } = await supabase
    .from("finance")
    .select("month, amount")
    .in("month", pastMonths)
    .eq("type", "매출")
    .eq("status", "completed");

  const monthTotals: Record<string, number> = {};
  for (const r of pastRows ?? []) {
    monthTotals[r.month] = (monthTotals[r.month] ?? 0) + Number(r.amount);
  }
  const pastTotals = pastMonths.map((m) => monthTotals[m] ?? 0).filter((v) => v > 0);
  const pastAvg = pastTotals.length > 0 ? pastTotals.reduce((a, b) => a + b, 0) / pastTotals.length : 0;

  // 이번 달 현재까지 매출
  const { data: currentRows } = await supabase
    .from("finance")
    .select("amount, date")
    .eq("month", currentMonth)
    .eq("type", "매출")
    .eq("status", "completed");

  const currentTotal = (currentRows ?? []).reduce((s, r) => s + Number(r.amount), 0);

  // 이번 달 영업일 기준 진행률
  const totalDays = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const elapsedDays = today.getDate();
  const progress = elapsedDays / totalDays;

  // 예측: 현재 페이스 기반 + 과거 평균 블렌딩 (70:30)
  const paceProjection = progress > 0 ? currentTotal / progress : 0;
  const projected = Math.round(paceProjection * 0.7 + pastAvg * 0.3);

  return NextResponse.json({
    currentTotal,
    projected,
    pastAvg: Math.round(pastAvg),
    progress: Math.round(progress * 100),
    elapsedDays,
    totalDays,
  });
}
