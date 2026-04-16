import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";
import { createAdminClient } from "@/utils/supabase/admin";
import { callClaude } from "@/utils/aiClients";
import { buildGuidePrompt } from "@/utils/promptBuilder";
import { getGuideRefBlock, type GuideCategory } from "@/utils/guideRefs";

export const maxDuration = 60;

const CATEGORIES: GuideCategory[] = [
  "창업 절차", "계약·법률", "자금 조달", "입지 선정", "운영 노하우",
];

export async function POST(req: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const body = await req.json() as { topic: string; category: string };
  if (!body.topic?.trim() || !body.category) {
    return NextResponse.json({ error: "topic, category 필수" }, { status: 400 });
  }
  if (!CATEGORIES.includes(body.category as GuideCategory)) {
    return NextResponse.json({ error: "허용되지 않은 카테고리" }, { status: 400 });
  }

  const publicDataBlock = getGuideRefBlock(body.category as GuideCategory);

  const prompt = buildGuidePrompt({
    topic: body.topic.trim(),
    category: body.category,
    publicDataBlock,
  });
  const systemPrompt = "당신은 프랜차이즈 창업 컨설턴트입니다. 특정 브랜드를 추천하지 않으며, 공식 법령·기관 기반의 중립적 가이드만 제공합니다.";
  const content = await callClaude(prompt, systemPrompt);

  const title = body.topic.trim();

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("frandoor_blog_drafts")
    .insert({
      content_type: "guide",
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
