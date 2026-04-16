import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";
import { createAdminClient } from "@/utils/supabase/admin";
import { callClaude } from "@/utils/aiClients";
import { buildTrendPrompt } from "@/utils/promptBuilder";
import { fetchKosisMonthly } from "@/utils/kosis";
import { fetchFoodSafetyTrend } from "@/utils/foodSafety";

export const maxDuration = 60;

export async function POST(req: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const body = await req.json() as { ym: string; industry: string };
  if (!body.ym || !body.industry) {
    return NextResponse.json({ error: "ym, industry 필수" }, { status: 400 });
  }

  const kosisMap: Record<string, { orgId: string; tblId: string }> = {
    "음식점업": { orgId: "101", tblId: "DT_1K52002" },
    "소매업":   { orgId: "101", tblId: "DT_1K52003" },
    "서비스업": { orgId: "101", tblId: "DT_1K52004" },
  };
  const kosisCfg = kosisMap[body.industry] ?? kosisMap["음식점업"];

  const [kosis, food] = await Promise.all([
    fetchKosisMonthly({ ...kosisCfg, ym: body.ym }),
    fetchFoodSafetyTrend({ ym: body.ym, keyword: body.industry }),
  ]);

  const factBlocks = [
    `[KOSIS ${body.industry}]\n${kosis.summary}`,
    `[식품안전나라]\n${food.summary}`,
  ].join("\n\n");

  const prompt = buildTrendPrompt({ ym: body.ym, industry: body.industry, factBlocks });
  const systemPrompt = "당신은 프랜차이즈 업계 데이터 저널리스트입니다. 공식 수치만 사용하고 추정은 금지합니다.";
  const html = await callClaude(prompt, systemPrompt);

  const title = `${body.ym} ${body.industry} 트렌드 리포트`;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("frandoor_blog_drafts")
    .insert({
      content_type: "trend",
      channel: "frandoor",
      title,
      content: html,
      status: "draft",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    post: { ...data, html: data?.content ?? html },
  });
}
