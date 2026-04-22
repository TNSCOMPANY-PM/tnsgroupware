import { createAdminClient } from "@/utils/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MAX_RETRIES = 3;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://tnsgroupware.vercel.app";

// ── 재시도 래퍼 ──
async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T | null> {
  for (let i = 0; i < MAX_RETRIES; i++) {
    try { return await fn(); }
    catch (e) { console.error(`❌ [${label}] 시도 ${i + 1}/${MAX_RETRIES}:`, e instanceof Error ? e.message : e); }
  }
  return null;
}

// ── 플랜 추출 ──
function getBrandPlan(factData: { keyword: string; label: string }[] | null): Record<string, boolean> {
  const defaults = { auto_enabled: false, geo_check: true, seo_check: true, aeo_check: false, blog_tistory: true, blog_naver: true, blog_frandoor: true, blog_medium: false };
  if (!factData || !Array.isArray(factData)) return defaults;
  const entry = factData.find(d => d.label === "__brand_plan__");
  if (!entry) return defaults;
  try { return { ...defaults, ...JSON.parse(entry.keyword) }; } catch { return defaults; }
}

// ── 주제 선정 ──
async function pickTopic(brandId: string, brandName: string, supabase: ReturnType<typeof createAdminClient>): Promise<{ topic: string; reader_stage: string; search_intent: string }> {
  // 1순위: topic_pool pending
  const { data: poolTopic } = await supabase
    .from("topic_pool")
    .select("*")
    .eq("brand_id", brandId)
    .eq("status", "pending")
    .order("priority", { ascending: false })
    .order("created_at")
    .limit(1)
    .maybeSingle();

  if (poolTopic) {
    await supabase.from("topic_pool").update({ status: "used", used_at: new Date().toISOString() }).eq("id", poolTopic.id);
    return { topic: poolTopic.topic, reader_stage: poolTopic.reader_stage ?? "decision", search_intent: poolTopic.search_intent ?? "transactional" };
  }

  // 2순위: AI 자동 생성
  const today = new Date().toISOString().slice(0, 10);
  const month = new Date().toLocaleString("ko-KR", { month: "long" });
  try {
    const res = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 500,
      system: "블로그 주제 1개를 JSON으로 제안. {\"topic\": \"...\", \"reader_stage\": \"decision\", \"search_intent\": \"transactional\"}",
      messages: [{ role: "user", content: `${brandName} 프랜차이즈 블로그 주제 1개. ${month}, ${today} 기준 트렌드 반영.` }],
    });
    const text = res.content[0]?.type === "text" ? res.content[0].text : "";
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch { /* fallback */ }

  return { topic: `${brandName} 창업비용 총정리 ${today.slice(0, 7)}`, reader_stage: "decision", search_intent: "transactional" };
}

// ── 내부 API 호출 헬퍼 (쿠키 없이 서버 내부 호출) ──
async function internalPost(path: string, body: Record<string, unknown>): Promise<Response> {
  return fetch(`${SITE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── 메인 ──
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const todayStr = kstNow.toISOString().slice(0, 10);
  const dayOfWeek = kstNow.getDay();

  console.log(`🚀 [Frandoor Daily] ${todayStr} (요일:${dayOfWeek}) 시작`);

  // 주말 스킵
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return NextResponse.json({ ok: true, skipped: true, reason: "주말" });
  }

  // Step 0: DB에서 오늘 요일 브랜드 조회
  const { data: schedules } = await supabase
    .from("weekly_schedule")
    .select("brand_id, geo_brands(id, name, landing_url, fact_data)")
    .eq("day_of_week", dayOfWeek);

  if (!schedules || schedules.length === 0) {
    return NextResponse.json({ ok: true, skipped: true, reason: "오늘 배정 브랜드 없음" });
  }

  const results: Record<string, unknown>[] = [];

  for (const schedule of schedules) {
    const brand = schedule.geo_brands as unknown as { id: string; name: string; landing_url: string; fact_data: { keyword: string; label: string }[] };
    if (!brand) continue;

    const plan = getBrandPlan(brand.fact_data);
    if (!plan.auto_enabled) {
      console.log(`⏭️ [${brand.name}] auto OFF — 스킵`);
      results.push({ brand: brand.name, skipped: true, reason: "auto_enabled=false" });
      continue;
    }

    console.log(`📦 [${brand.name}] 파이프라인 시작`);
    let geoScore: number | null = null;

    // Step 1: GEO 체크
    if (plan.geo_check) {
      const geoResult = await withRetry(async () => {
        const res = await internalPost("/api/geo/check", { brand_id: brand.id });
        if (!res.ok) return null;
        const data = await res.json();
        // run 생성 후 프롬프트 실행 — 간략화 (기존 GEO 체크와 동일)
        return data;
      }, `GEO ${brand.name}`);
      if (geoResult?.score !== undefined) geoScore = geoResult.score;
    }

    // Step 2: 주제 선정
    const { topic } = await pickTopic(brand.id, brand.name, supabase);
    console.log(`📝 [${brand.name}] 주제: ${topic}`);

    // TODO(geo/cron-v2): /api/geo/generate + /api/geo/syndicate 로 재배선
    // Step 3~5 (레거시 blog-generate·blog-convert·tistory 퍼블리시) 는 V2 이관 미완료로 비활성화.
    // 기존 코드는 /api/geo/blog-generate (410 Gone) 를 호출해 항상 실패했음. 재구현 전까지
    // frandoor_blog_drafts 에 draft 가 쌓이지 않음. Step 1 (GEO 체크) + Step 6 (리포트) 만 수행.
    const channelResults: { channel: string; status: string }[] = [];

    // Step 6: 데일리 리포트
    const reportResult = await withRetry(async () => {
      const res = await anthropic.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 1000,
        system: "운영 리포트 JSON으로만 응답.",
        messages: [{ role: "user", content: `${brand.name} 일간 리포트:
GEO: ${geoScore ?? "미체크"}%, 블로그: ${channelResults.map(r => `${r.channel}(${r.status})`).join(", ")}, 주제: ${topic}
JSON: {"summary":"3줄요약","insights":["인사이트"],"action_items":["액션"]}` }],
      });
      const text = res.content[0]?.type === "text" ? res.content[0].text : "{}";
      const match = text.match(/\{[\s\S]*\}/);
      return match ? JSON.parse(match[0]) : {};
    }, `리포트 ${brand.name}`);

    await supabase.from("frandoor_daily_reports").insert({
      brand_id: brand.id, date: todayStr, geo_score: geoScore,
      blog_results: channelResults,
      summary: reportResult?.summary ?? "",
      insights: reportResult?.insights ?? [],
      action_items: reportResult?.action_items ?? [],
    });

    results.push({ brand: brand.name, topic, channels: channelResults, geo: geoScore });
    console.log(`✅ [${brand.name}] 완료`);
  }

  console.log(`🏁 [Frandoor Daily] 완료 — ${results.length}개 처리`);
  return NextResponse.json({ ok: true, date: todayStr, results });
}
