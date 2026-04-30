/**
 * v4 — /api/geo/generate. 단일 sonnet call (Plan/Write 분할 폐기).
 * 입력: { brand_id, topic }
 * 출력: V4Result { draftId, content, lintWarnings, ccUnmatched, ... }
 */

import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";
import {
  generateV4,
  FtcBrandIdMissingError,
  FtcRowNotFoundError,
} from "@/lib/geo/v4/pipeline";
import type { V4Input } from "@/lib/geo/v4/types";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

function parseInput(raw: unknown): V4Input | { error: string } {
  if (!raw || typeof raw !== "object") return { error: "INVALID_INPUT" };
  const r = raw as Record<string, unknown>;
  const brand_id = typeof r.brand_id === "string" ? r.brand_id.trim() : "";
  const topic = typeof r.topic === "string" ? r.topic.trim() : "";
  if (!brand_id) return { error: "brand_id 필수 (geo_brands.id)" };
  if (!topic) return { error: "topic 필수" };
  return { brand_id, topic };
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
    const out = await generateV4(parsed);
    return NextResponse.json(out);
  } catch (e) {
    if (e instanceof FtcBrandIdMissingError) {
      return NextResponse.json(
        {
          error: e.code,
          message: e.message,
          brandId: e.brandId,
          brandLabel: e.brandLabel,
          hint: "ftc_brands_2024 의 id 를 geo_brands.ftc_brand_id 에 매핑한 뒤 재시도하세요.",
        },
        { status: 400 },
      );
    }
    if (e instanceof FtcRowNotFoundError) {
      return NextResponse.json(
        { error: e.code, message: e.message, ftcBrandId: e.ftcBrandId },
        { status: 404 },
      );
    }
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[v4.gen] failed:", msg);
    return NextResponse.json({ error: "GENERATE_FAILED", message: msg }, { status: 500 });
  }
}
