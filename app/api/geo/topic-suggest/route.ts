import { createAdminClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// GET: 주제 풀 조회
export async function GET(request: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const { searchParams } = new URL(request.url);
  const brandId = searchParams.get("brand_id");
  if (!brandId) return NextResponse.json({ error: "brand_id required" }, { status: 400 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("topic_pool")
    .select("*")
    .eq("brand_id", brandId)
    .order("priority", { ascending: false })
    .order("created_at");

  if (error) {
    if (error.code === "PGRST205" || error.code === "42P01") return NextResponse.json([]);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data ?? []);
}

// POST: 주제 추가 또는 AI 주제 제안
export async function POST(request: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const body = await request.json() as {
    action: "add" | "suggest" | "bulk_add";
    brand_id: string;
    topic?: string;
    reader_stage?: string;
    search_intent?: string;
    priority?: number;
    topics?: { topic: string; reader_stage: string; search_intent: string }[];
  };

  const supabase = createAdminClient();

  // 수동 주제 추가
  if (body.action === "add") {
    if (!body.topic?.trim()) return NextResponse.json({ error: "topic required" }, { status: 400 });
    const { data, error } = await supabase
      .from("topic_pool")
      .insert({
        brand_id: body.brand_id,
        topic: body.topic.trim(),
        reader_stage: body.reader_stage ?? "decision",
        search_intent: body.search_intent ?? "transactional",
        source: "manual",
        priority: body.priority ?? 0,
      })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  }

  // AI 주제 일괄 추가
  if (body.action === "bulk_add" && body.topics) {
    const inserts = body.topics.map(t => ({
      brand_id: body.brand_id,
      topic: t.topic,
      reader_stage: t.reader_stage,
      search_intent: t.search_intent,
      source: "trend",
      priority: 0,
    }));
    const { data, error } = await supabase.from("topic_pool").insert(inserts).select();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  // AI 주제 제안
  if (body.action === "suggest") {
    const { data: brand } = await supabase
      .from("geo_brands")
      .select("name, landing_url, fact_data")
      .eq("id", body.brand_id)
      .single();

    if (!brand) return NextResponse.json({ error: "브랜드 없음" }, { status: 404 });

    // 기존 주제 조회 (중복 방지)
    const { data: existingTopics } = await supabase
      .from("topic_pool")
      .select("topic")
      .eq("brand_id", body.brand_id);
    const { data: existingDrafts } = await supabase
      .from("frandoor_blog_drafts")
      .select("title")
      .eq("brand_id", body.brand_id);

    const usedTopics = [
      ...(existingTopics ?? []).map(t => t.topic),
      ...(existingDrafts ?? []).map(d => d.title),
    ].filter(Boolean);

    // 최근 GEO 점수
    const { data: latestGeo } = await supabase
      .from("geo_check_runs")
      .select("score, run_date")
      .eq("brand_id", body.brand_id)
      .order("run_date", { ascending: false })
      .limit(1);

    const geoScore = latestGeo?.[0]?.score ?? null;
    const month = new Date().toLocaleString("ko-KR", { month: "long" });

    try {
      const res = await anthropic.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 2000,
        system: "프랜차이즈 창업 블로그 편집장. JSON으로만 응답.",
        messages: [{ role: "user", content: `${brand.name} 브랜드의 블로그 주제를 5개 제안해주세요.

브랜드: ${brand.name}
카테고리: ${brand.landing_url ?? ""}
현재 GEO 점수: ${geoScore !== null ? `${geoScore}%` : "미측정"}
현재 시즌: ${month} (${geoScore !== null && geoScore < 30 ? "GEO 점수 낮음 — 노출 강화 주제 필요" : "일반 운영"})
이미 작성된 주제: ${usedTopics.slice(0, 10).join(", ") || "없음"}

각 주제에 대해:
- topic: 블로그 제목 수준의 구체적 주제
- reader_stage: awareness / consideration / decision
- search_intent: informational / navigational / transactional
- reason: 이 주제를 추천하는 이유 (1줄)

JSON: {"topics": [{"topic": "...", "reader_stage": "...", "search_intent": "...", "reason": "..."}, ...]}` }],
      });

      const text = res.content[0]?.type === "text" ? res.content[0].text : "";
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);

      return NextResponse.json(parsed);
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "AI 제안 실패" }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "invalid action" }, { status: 400 });
}

// DELETE: 주제 삭제
export async function DELETE(request: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const supabase = createAdminClient();
  await supabase.from("topic_pool").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}

// PATCH: 주제 상태 변경
export async function PATCH(request: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const body = await request.json() as { id: string; status?: string; priority?: number };
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const supabase = createAdminClient();
  const updates: Record<string, unknown> = {};
  if (body.status) updates.status = body.status;
  if (body.priority !== undefined) updates.priority = body.priority;
  if (body.status === "used") updates.used_at = new Date().toISOString();

  await supabase.from("topic_pool").update(updates).eq("id", body.id);
  return NextResponse.json({ ok: true });
}
