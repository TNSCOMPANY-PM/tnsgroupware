import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

// 카테고리별 알림 기준 설정
// 더널리: 김정섭(5), 김용준(4), 심규성(7) / 30일 기준
// 티제이웹: 김동균(3) / 365일 기준
const ALERT_CONFIG: Record<string, { threshold: number; userIds: string[] }> = {
  "더널리": { threshold: 30, userIds: ["5", "4", "7"] },
  "티제이웹": { threshold: 365, userIds: ["3"] },
};

export async function POST() {
  const supabase = await createClient();

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const created: string[] = [];

  for (const [category, config] of Object.entries(ALERT_CONFIG)) {
    const { data: clients } = await supabase
      .from("clients")
      .select("id, name")
      .eq("category", category);

    if (!clients?.length) continue;

    for (const client of clients) {
      // 해당 고객사의 마지막 매출 입금일
      const { data: lastRow } = await supabase
        .from("finance")
        .select("date")
        .eq("client_name", client.name)
        .eq("type", "매출")
        .order("date", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!lastRow?.date) continue;

      const lastDate = new Date(lastRow.date);
      const diffDays = Math.floor(
        (today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      // 딱 기준일에만 알림 생성
      if (diffDays !== config.threshold) continue;

      for (const userId of config.userIds) {
        // 같은 (client_id, last_deposit_date, user) 중복 방지
        const { data: existing } = await supabase
          .from("client_alerts")
          .select("id")
          .eq("client_id", client.id)
          .eq("last_deposit_date", lastRow.date)
          .eq("target_user_id", userId)
          .maybeSingle();

        if (existing) continue;

        await supabase.from("client_alerts").insert({
          client_id: client.id,
          client_name: client.name,
          category,
          last_deposit_date: lastRow.date,
          days_since: diffDays,
          threshold: config.threshold,
          triggered_date: todayStr,
          target_user_id: userId,
          is_done: false,
        });

        created.push(`${client.name} → user ${userId}`);
      }
    }
  }

  return NextResponse.json({ ok: true, created });
}
