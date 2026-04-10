import { createAdminClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";

// GET: 전체 주간 스케줄 조회
export async function GET() {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("weekly_schedule")
    .select("id, brand_id, day_of_week, sort_order, geo_brands(id, name)")
    .order("day_of_week")
    .order("sort_order");

  if (error) {
    if (error.code === "PGRST205" || error.code === "42P01") return NextResponse.json([]);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data ?? []);
}

// POST: 브랜드-요일 배정
export async function POST(request: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const body = await request.json() as { brand_id: string; day_of_week: number };
  if (!body.brand_id || body.day_of_week === undefined) {
    return NextResponse.json({ error: "brand_id, day_of_week 필수" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // 중복 체크
  const { data: existing } = await supabase
    .from("weekly_schedule")
    .select("id")
    .eq("brand_id", body.brand_id)
    .eq("day_of_week", body.day_of_week);

  if (existing && existing.length > 0) {
    return NextResponse.json({ error: "이미 배정됨" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("weekly_schedule")
    .insert({ brand_id: body.brand_id, day_of_week: body.day_of_week })
    .select("id, brand_id, day_of_week, sort_order, geo_brands(id, name)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

// DELETE: 배정 해제
export async function DELETE(request: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const brandId = searchParams.get("brand_id");
  const dayOfWeek = searchParams.get("day_of_week");

  const supabase = createAdminClient();

  if (id) {
    await supabase.from("weekly_schedule").delete().eq("id", id);
  } else if (brandId && dayOfWeek) {
    await supabase.from("weekly_schedule").delete().eq("brand_id", brandId).eq("day_of_week", parseInt(dayOfWeek));
  } else {
    return NextResponse.json({ error: "id 또는 brand_id+day_of_week 필요" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
