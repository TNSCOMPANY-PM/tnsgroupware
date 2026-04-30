/**
 * v3-01: /api/geo/generate — generateV3 호출.
 * 4 step pipeline (Plan → Structure → Write → Polish + Validate).
 * brand / industry mode 분기 내부.
 */

import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";
import {
  generateV3,
  InsufficientDataError,
  HallucinationDetectedError,
  LintErrorV3,
} from "@/lib/geo/v3/pipeline";
import type { GenerateInput } from "@/lib/geo/v3/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const TIER_VALUES: ReadonlySet<"A" | "B" | "C"> = new Set(["A", "B", "C"]);

function parseInput(raw: unknown): GenerateInput | { error: string } {
  if (!raw || typeof raw !== "object") return { error: "INVALID_INPUT" };
  const r = raw as Record<string, unknown>;
  const topic = typeof r.topic === "string" ? r.topic.trim() : "";
  const tiersRaw = Array.isArray(r.tiers) ? r.tiers : [];
  const tiers = tiersRaw.filter((t): t is "A" | "B" | "C" =>
    typeof t === "string" && TIER_VALUES.has(t as "A" | "B" | "C"),
  );
  if (!topic) return { error: "topic 필수" };
  if (tiers.length === 0) return { error: "tiers 1개 이상 필수" };

  const mode = r.mode === "industry" ? "industry" : "brand";
  if (mode === "industry") {
    const industry = typeof r.industry === "string" ? r.industry.trim() : "";
    if (!industry) return { error: "industry 필수" };
    return { mode: "industry", industry, topic, tiers };
  }

  const brandId = typeof r.brandId === "string" ? r.brandId : "";
  if (!brandId) return { error: "brandId 필수" };
  return { mode: "brand", brandId, topic, tiers };
}

export async function POST(req: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const raw = await req.json().catch(() => null);
  const parsed = parseInput(raw);
  if ("error" in parsed) {
    return NextResponse.json({ error: "INVALID_INPUT", message: parsed.error }, { status: 422 });
  }

  try {
    const out = await generateV3(parsed);
    return NextResponse.json(out);
  } catch (e) {
    if (e instanceof InsufficientDataError) {
      return NextResponse.json(
        { error: e.code, message: e.message, stats: e.stats },
        { status: 400 },
      );
    }
    if (e instanceof HallucinationDetectedError) {
      return NextResponse.json(
        { error: e.code, message: e.message, unmatched: e.unmatched },
        { status: 400 },
      );
    }
    if (e instanceof LintErrorV3) {
      return NextResponse.json(
        { error: e.code, message: e.message, lintErrors: e.lintErrors },
        { status: 400 },
      );
    }
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[v3.gen] failed:", msg);
    return NextResponse.json({ error: "GENERATE_FAILED", message: msg }, { status: 500 });
  }
}
