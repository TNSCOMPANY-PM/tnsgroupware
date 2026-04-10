import { createAdminClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";

const BONUS_TARGET_GP = 50_000_000;
const BONUS_POOL_RATE = 0.2;
const BONUS_JAEMIN_RATE = 0.15;
const BONUS_DN_JEONGSEOP_RATE = 0.45;
const BONUS_DN_YONGJUN_RATE = 0.275;

type BonusKey = "jeongseop" | "yongjun" | "gyuseong" | "donggyun" | "jaemin";

const MEMBER_NAMES: Record<BonusKey, string> = {
  jaemin:    "박재민",
  jeongseop: "김정섭",
  yongjun:   "김용준",
  gyuseong:  "심규성",
  donggyun:  "김동균",
};

type FinRow = { type: string; amount: number; category: string | null };

function normalizeTeam(category: string | undefined | null): "더널리" | "티제이웹" | "기타" {
  const raw = (category ?? "").trim();
  if (raw === "더널리" || raw === "더널리 충전") return "더널리";
  if (raw === "티제이웹" || raw === "유지보수") return "티제이웹";
  return "기타";
}

function calcBonus(rows: FinRow[]): Record<BonusKey, number> & { grossTotalSupply: number; bonusPool: number } {
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

  return { jeongseop, yongjun, gyuseong, donggyun: tjContributionBonus, jaemin, grossTotalSupply, bonusPool };
}

export async function GET() {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const today = new Date();
  const year  = today.getFullYear();
  const month = today.getMonth() + 1;
  const quarter = Math.ceil(month / 3);
  const qStartMonth = (quarter - 1) * 3 + 1;
  const qEndMonth   = quarter * 3;

  const monthsInQuarter: string[] = [];
  for (let m = qStartMonth; m <= Math.min(qEndMonth, month); m++) {
    monthsInQuarter.push(`${year}-${String(m).padStart(2, "0")}`);
  }

  const supabase = createAdminClient();

  // 멤버별 누적 합산
  const memberTotals: Record<BonusKey, number> = { jeongseop: 0, yongjun: 0, gyuseong: 0, donggyun: 0, jaemin: 0 };
  const monthBreakdowns: { month: string; bonusPool: number; grossTotalSupply: number; members: Record<BonusKey, number> }[] = [];

  for (const monthStr of monthsInQuarter) {
    const { data, error } = await supabase
      .from("finance")
      .select("type,amount,category")
      .eq("month", monthStr)
      .eq("status", "completed");

    if (error || !data || data.length === 0) {
      monthBreakdowns.push({ month: monthStr, bonusPool: 0, grossTotalSupply: 0, members: { jeongseop: 0, yongjun: 0, gyuseong: 0, donggyun: 0, jaemin: 0 } });
      continue;
    }

    const { grossTotalSupply, bonusPool, ...members } = calcBonus(data as FinRow[]);
    monthBreakdowns.push({ month: monthStr, bonusPool, grossTotalSupply, members });
    for (const key of Object.keys(memberTotals) as BonusKey[]) {
      memberTotals[key] += members[key];
    }
  }

  const totalPayout = Object.values(memberTotals).reduce((s, v) => s + v, 0);
  const quarterLabel = `${year}년 ${quarter}분기`;
  const paidInMonth  = `${year}-${String(qEndMonth).padStart(2, "0")}`;

  const memberList = (Object.keys(MEMBER_NAMES) as BonusKey[]).map((key) => ({
    key,
    name: MEMBER_NAMES[key],
    total: memberTotals[key],
  })).sort((a, b) => b.total - a.total);

  return NextResponse.json({
    quarter,
    year,
    quarterLabel,
    paidInMonth,
    totalPayout,
    memberList,
    monthBreakdowns,
  });
}
