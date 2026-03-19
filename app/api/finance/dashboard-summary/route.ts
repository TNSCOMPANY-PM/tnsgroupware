import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

/** 당월 YYYY-MM 키 (매출/매입 페이지와 동일한 월 기준) */
function getCurrentMonthKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

/** row의 date 또는 month로 해당 월이 monthKey(YYYY-MM)와 같은지 */
function isRowInMonth(
  rowDate: string | null | undefined,
  rowMonth: string | null | undefined,
  monthKey: string
): boolean {
  const dateStr = rowDate ?? (rowMonth ? `${rowMonth}-01` : "");
  if (!dateStr || !monthKey) return false;
  const ymd = dateStr.replace(/\D/g, "");
  if (ymd.length >= 6) {
    let y: number;
    let m: number;
    if (ymd.length >= 8 && (ymd.startsWith("19") || ymd.startsWith("20"))) {
      y = parseInt(ymd.slice(0, 4), 10);
      m = parseInt(ymd.slice(4, 6), 10);
    } else {
      y = 2000 + parseInt(ymd.slice(0, 2), 10);
      m = parseInt(ymd.slice(2, 4), 10);
    }
    const rowMonthKey = `${y}-${String(m).padStart(2, "0")}`;
    return rowMonthKey === monthKey;
  }
  return false;
}

/** 쿼리 month 값이 YYYY-MM 형식이면 사용, 아니면 null */
function parseMonthParam(value: string | null): string | null {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}$/.test(trimmed)) return trimmed;
  return null;
}

/**
 * 대시보드용 당월 재무 요약 (매출/매입 페이지와 동일한 finance 테이블 기준)
 * - GET ?month=2026-03 으로 월 지정 가능 (미지정 시 서버 현재월)
 * - monthlyRevenue: 해당 월 매출(매출 타입, completed만) 합계
 * - monthlyGrossProfit: 해당 월 매출총이익 = 매출 - 매입
 * - survivalBalance: 해당 월 순입출 = 매출 - 매입
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const monthParam = parseMonthParam(searchParams.get("month"));
    const monthKey = monthParam ?? getCurrentMonthKey();

    const supabase = await createClient();
    const { data: rows, error } = await supabase
      .from("finance")
      .select("id, date, month, type, amount, status")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 500 }
      );
    }

    // DB 행의 date/month가 해당 월(YYYY-MM)에 속하는지 매출/매입 페이지와 동일 로직으로 필터
    const list = Array.isArray(rows) ? rows : [];
    const paidInMonth = list.filter(
      (r) =>
        r.status === "completed" &&
        isRowInMonth(r.date, r.month, monthKey)
    );

    let revenue = 0;
    let purchase = 0;
    for (const r of paidInMonth) {
      const amt = Number(r.amount) || 0;
      if (r.type === "매입") purchase += amt;
      else revenue += amt;
    }

    const margin = revenue - purchase;

    return NextResponse.json({
      monthlyRevenue: revenue,
      monthlyGrossProfit: margin,
      survivalBalance: margin,
      monthKey,
    });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}
