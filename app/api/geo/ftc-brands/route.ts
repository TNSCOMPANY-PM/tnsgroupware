/**
 * v2-10 GET /api/geo/ftc-brands?q=&limit=
 *
 * frandoor.ftc_brands_2024 typeahead 검색 (9,552 brand universe).
 * editor UI 의 brand 선택 dropdown 을 ftc 검색으로 교체.
 *
 * 응답: [{ id, name, corp, industry }]
 */
import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";
import { isFrandoorConfigured, createFrandoorClient } from "@/utils/supabase/frandoor";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  if (!isFrandoorConfigured()) {
    return NextResponse.json(
      { error: "FRANDOOR_NOT_CONFIGURED", message: "FRANDOOR env 미설정" },
      { status: 503 },
    );
  }

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10) || 20));

  if (!q || q.length < 1) return NextResponse.json([]);

  try {
    const sb = createFrandoorClient();
    // brand_nm ilike 검색. 대표성 있는 컬럼만 select.
    const { data, error } = await sb
      .from("ftc_brands_2024")
      .select("id, brand_nm, corp_nm, induty_lclas, induty_mlsfc")
      .ilike("brand_nm", `%${q}%`)
      .limit(limit);

    if (error) {
      console.error("[ftc-brands] 검색 실패:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const result = (data ?? []).map((r) => ({
      id: r.id,
      name: r.brand_nm,
      corp: r.corp_nm,
      industry: r.induty_mlsfc ?? r.induty_lclas ?? null,
    }));
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "FETCH_FAILED", message: msg }, { status: 500 });
  }
}
