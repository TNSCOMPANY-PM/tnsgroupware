import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";
import { createAdminClient } from "@/utils/supabase/admin";
import { callClaude } from "@/utils/aiClients";
import { buildExternalPrompt } from "@/utils/promptBuilder";
import { fetchFrandoorPage } from "@/utils/frandoorFetch";

export const maxDuration = 60;

export async function POST(req: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const body = await req.json() as {
    source_url: string;
    platform: "tistory" | "naver" | "medium";
  };
  if (!body.source_url || !body.platform) {
    return NextResponse.json({ error: "source_url, platform 필수" }, { status: 400 });
  }

  const src = await fetchFrandoorPage(body.source_url);
  if (!src.ok || !src.textBlock) {
    return NextResponse.json(
      { error: "frandoor 페이지를 불러오지 못했습니다. URL 확인." },
      { status: 400 },
    );
  }

  const prompt = buildExternalPrompt({
    sourceContent: src.textBlock,
    sourceUrl: src.canonicalUrl,
    sourceTitle: src.title,
    platform: body.platform,
  });
  const systemPrompt = "당신은 프랜차이즈 산업 전문 기자입니다. 원본 페이지에 없는 내용은 절대 만들어내지 않습니다.";
  const content = await callClaude(prompt, systemPrompt);

  const title = `[${body.platform}] ${src.title}`;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("frandoor_blog_drafts")
    .insert({
      content_type: "external",
      channel: body.platform,
      title,
      content,
      status: "draft",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, post: { ...data, html: content } });
}
