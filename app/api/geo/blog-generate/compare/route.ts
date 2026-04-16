import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";
import { createAdminClient } from "@/utils/supabase/admin";
import { callClaude } from "@/utils/aiClients";
import { buildComparePrompt } from "@/utils/promptBuilder";
import { fetchFtcFactByBrandName } from "@/utils/ftcFranchise";

export const maxDuration = 60;

export async function POST(req: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const body = await req.json() as {
    industry: string;
    brands: string[];
    criteria: string;
  };
  if (!body.industry || !Array.isArray(body.brands) || body.brands.length < 2 || !body.criteria) {
    return NextResponse.json(
      { error: "industry, brands(2개 이상), criteria 필수" },
      { status: 400 },
    );
  }

  const factResults = await Promise.all(
    body.brands.map(async (name) => {
      const r = await fetchFtcFactByBrandName(name);
      return { name, factBlock: r.factBlock };
    }),
  );

  const prompt = buildComparePrompt({
    industry: body.industry,
    brands: factResults,
    criteria: body.criteria,
  });
  const systemPrompt = "당신은 프랜차이즈 업계 데이터 분석가입니다. 공정위 공식 수치 외에는 절대 사용하지 않으며, 우열을 단정하지 않습니다.";
  const content = await callClaude(prompt, systemPrompt);

  const title = `${body.industry} ${body.criteria} 비교 — ${body.brands.join(" vs ")}`;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("frandoor_blog_drafts")
    .insert({
      content_type: "compare",
      channel: "frandoor",
      title,
      content,
      status: "draft",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, post: { ...data, html: content } });
}
