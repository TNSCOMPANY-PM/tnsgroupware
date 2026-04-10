import { createAdminClient } from "@/utils/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { convertForPlatform } from "@/utils/blogConverter";
import type { ConvertTarget } from "@/types/blogConvert";

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
    const { topic, reader_stage, search_intent } = await pickTopic(brand.id, brand.name, supabase);
    console.log(`📝 [${brand.name}] 주제: ${topic}`);

    // Step 3: Frandoor 원본 생성
    const blogResult = await withRetry(async () => {
      const res = await internalPost("/api/geo/blog-generate", {
        brand_id: brand.id, platform: "frandoor", topic,
        provider: "claude", reader_stage, search_intent,
      });
      if (!res.ok) throw new Error(`blog-generate ${res.status}`);
      return await res.json();
    }, `블로그 생성 ${brand.name}`);

    if (!blogResult?.content) {
      results.push({ brand: brand.name, error: "블로그 생성 실패" });
      continue;
    }

    // Frandoor draft 저장
    await supabase.from("frandoor_blog_drafts").insert({
      brand_id: brand.id, channel: "frandoor", title: blogResult.title ?? topic,
      content: blogResult.content, meta_description: blogResult.meta_description ?? "",
      keywords: blogResult.keywords ?? [], faq: blogResult.faq ?? [],
      schema_markup: blogResult.schema_markup ?? "", status: "draft", target_date: todayStr,
    });

    const channelResults: { channel: string; status: string }[] = [{ channel: "frandoor", status: "draft" }];

    // Step 4: 플랫폼별 변환 + 저장
    const convertChannels: { key: string; target: ConvertTarget }[] = [
      { key: "blog_tistory", target: "tistory" },
      { key: "blog_naver", target: "naver" },
      { key: "blog_medium", target: "medium" },
    ];

    for (const ch of convertChannels) {
      if (!plan[ch.key]) continue;

      const converted = await withRetry(async () => {
        return convertForPlatform({
          content: blogResult.content, title: blogResult.title ?? "",
          target: ch.target, faq: blogResult.faq, keywords: blogResult.keywords,
          meta_description: blogResult.meta_description, schema_markup: blogResult.schema_markup,
        });
      }, `변환 ${ch.target} ${brand.name}`);

      if (!converted) { channelResults.push({ channel: ch.target, status: "convert_failed" }); continue; }

      const { data: draft } = await supabase.from("frandoor_blog_drafts").insert({
        brand_id: brand.id, channel: ch.target, title: blogResult.title ?? topic,
        content: converted.converted_content, meta_description: blogResult.meta_description ?? "",
        keywords: blogResult.keywords ?? [], faq: blogResult.faq ?? [],
        schema_markup: blogResult.schema_markup ?? "", status: "draft", target_date: todayStr,
      }).select("id").single();

      // Step 5: 티스토리 자동 임시저장
      if (ch.target === "tistory" && draft) {
        try {
          const pubRes = await internalPost("/api/geo/tistory/publish", {
            title: blogResult.title ?? topic,
            content: converted.converted_content,
            tags: blogResult.keywords ?? [],
            visibility: 0, // 비공개=임시저장
          });
          if (pubRes.ok) {
            const pubData = await pubRes.json();
            await supabase.from("frandoor_blog_drafts").update({
              status: "published", published_url: pubData.postUrl,
            }).eq("id", draft.id);
            channelResults.push({ channel: "tistory", status: "published" });
          } else {
            channelResults.push({ channel: "tistory", status: "publish_failed" });
          }
        } catch {
          channelResults.push({ channel: "tistory", status: "publish_error" });
        }
      } else {
        channelResults.push({ channel: ch.target, status: "draft" });
      }
    }

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
