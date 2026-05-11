/**
 * v4-17 — /api/geo/a-only/analyze (LLM1 Sonnet 업종 분석 각도 + buildIndustryAnalysisFacts).
 * 입력: { industry, topic } — brand 단위 X (v4-16 의 brand_id 입력은 폐기됨).
 * 출력: { draftId } — meta.a_only_facts 에 IndustryAnalysisFacts 저장.
 * stage: → a_only_analyzed.
 */

import { NextResponse } from "next/server";
import { getSessionOrSchedulerToken, unauthorized } from "@/utils/apiAuth";
import { runStep1AnalyzeAOnly } from "@/lib/geo/v4/pipeline";
import type { V4AOnlyInput } from "@/lib/geo/v4/types";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

function parseInput(raw: unknown): V4AOnlyInput | { error: string } {
  if (!raw || typeof raw !== "object") return { error: "INVALID_INPUT" };
  const r = raw as Record<string, unknown>;
  const industry = typeof r.industry === "string" ? r.industry.trim() : "";
  const topic = typeof r.topic === "string" ? r.topic.trim() : "";
  if (!industry) return { error: "industry 필수 (외식 15 업종 중 1)" };
  if (!topic) return { error: "topic 필수" };
  return { industry, topic };
}

export async function POST(req: Request) {
  const auth = await getSessionOrSchedulerToken(req);
  if (!auth.ok) return unauthorized();

  const raw = await req.json().catch(() => null);
  const parsed = parseInput(raw);
  if ("error" in parsed) {
    return NextResponse.json({ error: "INVALID_INPUT", message: parsed.error }, { status: 422 });
  }

  try {
    const out = await runStep1AnalyzeAOnly(parsed);
    return NextResponse.json(out);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[v4-17.1] failed:", msg);
    return NextResponse.json({ error: "A_ONLY_ANALYZE_FAILED", message: msg }, { status: 500 });
  }
}
