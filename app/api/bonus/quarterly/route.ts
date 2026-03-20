import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

// ── 성과급 계산 상수 (reports/page.tsx 와 동일) ──────────────────
const BONUS_TARGET_GP = 50_000_000;
const BONUS_POOL_RATE = 0.2;
const BONUS_JAEMIN_RATE = 0.15;
const BONUS_DN_JEONGSEOP_RATE = 0.45;
const BONUS_DN_YONGJUN_RATE = 0.275;

type BonusKey = "jeongseop" | "yongjun" | "gyuseong" | "donggyun" | "jaemin";

/** userId → 성과급 배분 키 */
const USER_BONUS_KEY: Record<string, BonusKey | null> = {
  "3": "donggyun",   // 김동균 (티제이웹)
  "4": "yongjun",    // 김용준 (더널리)
  "5": "jeongseop",  // 김정섭 (더널리)
  "6": "jaemin",     // 박재민 (경영지원)
  "7": "gyuseong",   // 심규성 (더널리)
};

type FinRow = { type: string; amount: number; category: string | null };

function normalizeTeam(category: string | undefined | null): "더널리" | "티제이웹" | "기타" {
  const raw = (category ?? "").trim();
  if (raw === "더널리" || raw === "더널리 충전") return "더널리";
  if (raw === "티제이웹" || raw === "유지보수") return "티제이웹";
  return "기타";
}

function calcBonus(rows: FinRow[]): Record<BonusKey, number> {
  const byTeam = {
    "더널리":  { revenue: 0, cost: 0 },
    "티제이웹": { revenue: 0, cost: 0 },
    "기타":    { revenue: 0, cost: 0 },
  };
  for (const r of rows) {
    const team = normalizeTeam(r.category);
    const amt = Number(r.amount) || 0;
    if (r.type === "매입") byTeam[team].cost += amt;
    else byTeam[team].revenue += amt;
  }
  const totalRevenue = Object.values(byTeam).reduce((s, v) => s + v.revenue, 0);
  const totalCost    = Object.values(byTeam).reduce((s, v) => s + v.cost, 0);
  const grossTotal   = totalRevenue - totalCost;

  const grossTotalSupply = Math.round((totalRevenue - totalCost) / 1.1);
  const excessOverTarget = Math.max(0, grossTotalSupply - BONUS_TARGET_GP);
  const bonusPool        = Math.round(excessOverTarget * BONUS_POOL_RATE);
  const jaemin           = Math.round(bonusPool * BONUS_JAEMIN_RATE);
  const teamPool         = bonusPool - jaemin;

  const dnGross = Math.max(0, byTeam["더널리"].revenue - byTeam["더널리"].cost);
  const tjGross = Math.max(0, byTeam["티제이웹"].revenue - byTeam["티제이웹"].cost);
  const sumGross = dnGross + tjGross;

  const tjContributionBonus = sumGross > 0 ? Math.round((teamPool * tjGross) / sumGross) : 0;
  const dnContributionBonus = teamPool - tjContributionBonus;

  const jeongseop = Math.round(dnContributionBonus * BONUS_DN_JEONGSEOP_RATE);
  const yongjun   = Math.round(dnContributionBonus * BONUS_DN_YONGJUN_RATE);
  const gyuseong  = dnContributionBonus - jeongseop - yongjun;

  return { jeongseop, yongjun, gyuseong, donggyun: tjContributionBonus, jaemin };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  // C레벨 등 성과급 대상 아닌 경우
  if (!(userId in USER_BONUS_KEY)) {
    return NextResponse.json({ total: 0, months: [], quarter: 0, year: 0, bonusKey: null });
  }
  const bonusKey = USER_BONUS_KEY[userId];

  const today = new Date();
  const year  = today.getFullYear();
  const month = today.getMonth() + 1;        // 1-12
  const quarter = Math.ceil(month / 3);      // 1-4
  const qStartMonth = (quarter - 1) * 3 + 1; // 1, 4, 7, 10
  const qEndMonth   = quarter * 3;            // 3, 6, 9, 12

  // 이번 분기에서 현재 달까지만 계산 (미래 달 제외)
  const monthsInQuarter: string[] = [];
  for (let m = qStartMonth; m <= Math.min(qEndMonth, month); m++) {
    monthsInQuarter.push(`${year}-${String(m).padStart(2, "0")}`);
  }

  const supabase = await createClient();
  const monthBonuses: { month: string; bonus: number; grossTotal: number }[] = [];
  let total = 0;

  for (const monthStr of monthsInQuarter) {
    const { data, error } = await supabase
      .from("finance")
      .select("type,amount,category")
      .eq("month", monthStr)
      .eq("status", "completed");

    if (error || !data || data.length === 0) {
      monthBonuses.push({ month: monthStr, bonus: 0, grossTotal: 0 });
      continue;
    }

    const rows = data as FinRow[];
    const grossTotal = rows.reduce((s, r) => {
      const amt = Number(r.amount) || 0;
      return r.type === "매입" ? s - amt : s + amt;
    }, 0);

    const bonuses = calcBonus(rows);
    const bonus   = bonusKey ? (bonuses[bonusKey] ?? 0) : 0;
    monthBonuses.push({ month: monthStr, bonus, grossTotal });
    total += bonus;
  }

  const quarterLabel = `${year}년 ${quarter}분기`;
  const paidInMonth  = `${year}-${String(qEndMonth).padStart(2, "0")}`;

  return NextResponse.json({
    userId,
    bonusKey,
    quarter,
    year,
    quarterLabel,
    months: monthBonuses,
    total,
    paidInMonth,
  });
}
