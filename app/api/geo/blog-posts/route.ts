import { createAdminClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";

// 전체 발행 이력 조회 (/content/posts 전용).
// 필터: content_type, brand_id, platform, from/to, page, pageSize.
export async function GET(request: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const { searchParams } = new URL(request.url);
  const contentType = searchParams.get("content_type") ?? "";
  const brandId = searchParams.get("brand_id") ?? "";
  const platform = searchParams.get("platform") ?? "";
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(5, parseInt(searchParams.get("pageSize") ?? "20", 10) || 20));

  const supabase = createAdminClient();
  let q = supabase
    .from("frandoor_blog_drafts")
    .select("id, brand_id, channel, title, status, target_date, published_url, created_at, content_type, geo_brands(name)", { count: "exact" })
    .order("created_at", { ascending: false });

  if (contentType) q = q.eq("content_type", contentType);
  if (brandId) q = q.eq("brand_id", brandId);
  if (platform) q = q.eq("channel", platform);
  if (from) q = q.gte("created_at", from);
  if (to) q = q.lte("created_at", to);

  const fromIdx = (page - 1) * pageSize;
  const toIdx = fromIdx + pageSize - 1;
  q = q.range(fromIdx, toIdx);

  const { data, error, count } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    rows: data ?? [],
    total: count ?? 0,
    page,
    pageSize,
  });
}
