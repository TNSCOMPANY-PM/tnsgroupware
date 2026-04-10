import { createAdminClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";

/** 이상 거래 감지: 평균 대비 2σ 이상 이탈 거래 반환 */
export async function GET(req: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month") ?? (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  })();

  const supabase = createAdminClient();
  const { data: rows } = await supabase
    .from("finance")
    .select("id, type, amount, client_name, description, date")
    .eq("month", month);

  if (!rows?.length) return NextResponse.json([]);

  // 타입별로 분리해서 통계 계산
  const byType: Record<string, number[]> = {};
  for (const r of rows) {
    const t = r.type ?? "기타";
    if (!byType[t]) byType[t] = [];
    byType[t].push(Number(r.amount));
  }

  const stats: Record<string, { mean: number; std: number }> = {};
  for (const [t, amounts] of Object.entries(byType)) {
    const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const std = Math.sqrt(amounts.reduce((s, v) => s + (v - mean) ** 2, 0) / amounts.length);
    stats[t] = { mean, std };
  }

  const anomalies = rows
    .filter((r) => {
      const { mean, std } = stats[r.type ?? "기타"] ?? { mean: 0, std: 0 };
      if (std === 0) return false;
      const z = (Number(r.amount) - mean) / std;
      return Math.abs(z) >= 2;
    })
    .map((r) => {
      const { mean, std } = stats[r.type ?? "기타"]!;
      const z = (Number(r.amount) - mean) / std;
      return {
        id: r.id,
        type: r.type,
        amount: Number(r.amount),
        client_name: r.client_name,
        date: r.date,
        description: r.description,
        z_score: Math.round(z * 10) / 10,
        reason: Number(r.amount) > mean ? "평균 대비 고액" : "평균 대비 소액",
      };
    })
    .sort((a, b) => Math.abs(b.z_score) - Math.abs(a.z_score));

  return NextResponse.json(anomalies);
}
