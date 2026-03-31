import { createAdminClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";

/** 고객 이탈 위험 스코어 (0~100, 높을수록 위험) */
export async function GET() {
  const supabase = createAdminClient();
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  // 활성 고객 조회
  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, category, status, next_contact_at")
    .neq("status", "종료");

  if (!clients?.length) return NextResponse.json([]);

  // 고객별 마지막 입금일 조회 (finance 테이블)
  const { data: deposits } = await supabase
    .from("finance")
    .select("client_name, date")
    .eq("type", "매출")
    .eq("status", "completed")
    .order("date", { ascending: false });

  // client_name → 마지막 입금일 맵
  const lastDepositMap: Record<string, string> = {};
  for (const d of deposits ?? []) {
    if (d.client_name && !lastDepositMap[d.client_name]) {
      lastDepositMap[d.client_name] = d.date;
    }
  }

  const result = clients.map((c) => {
    let score = 0;
    let reasons: string[] = [];

    const lastDeposit = lastDepositMap[c.name];
    if (!lastDeposit) {
      score += 40;
      reasons.push("입금 이력 없음");
    } else {
      const daysSince = Math.floor((today.getTime() - new Date(lastDeposit).getTime()) / 86400000);
      if (daysSince > 90) { score += 60; reasons.push(`마지막 입금 ${daysSince}일 경과`); }
      else if (daysSince > 60) { score += 40; reasons.push(`마지막 입금 ${daysSince}일 경과`); }
      else if (daysSince > 30) { score += 20; reasons.push(`마지막 입금 ${daysSince}일 경과`); }
    }

    if (c.next_contact_at && c.next_contact_at < todayStr) {
      const overdue = Math.floor((today.getTime() - new Date(c.next_contact_at).getTime()) / 86400000);
      score += Math.min(30, overdue);
      reasons.push(`연락 예정일 ${overdue}일 초과`);
    }

    if (c.status === "휴면") { score += 20; reasons.push("휴면 상태"); }

    return {
      id: c.id,
      name: c.name,
      category: c.category,
      score: Math.min(100, score),
      last_deposit: lastDeposit ?? null,
      next_contact_at: c.next_contact_at,
      reasons,
    };
  })
    .filter((c) => c.score >= 20)
    .sort((a, b) => b.score - a.score);

  return NextResponse.json(result);
}
