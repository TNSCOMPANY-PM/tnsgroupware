import { createAdminClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";

// GET: 브랜드별 저장된 초안 목록
export async function GET(request: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const { searchParams } = new URL(request.url);
  const brandId = searchParams.get("brand_id");
  if (!brandId) return NextResponse.json({ error: "brand_id required" }, { status: 400 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("frandoor_blog_drafts")
    .select("id, channel, title, status, target_date, published_url, created_at")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST: 초안 저장
export async function POST(request: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const body = await request.json() as {
    brand_id: string;
    channel: string;
    title: string;
    content: string;
    meta_description?: string;
    keywords?: string[];
    faq?: { q: string; a: string }[];
    schema_markup?: string;
    target_date?: string;
  };

  if (!body.brand_id || !body.content) {
    return NextResponse.json({ error: "brand_id, content 필수" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("frandoor_blog_drafts")
    .insert({
      brand_id: body.brand_id,
      channel: body.channel ?? "frandoor",
      title: body.title ?? "",
      content: body.content,
      meta_description: body.meta_description ?? "",
      keywords: body.keywords ?? [],
      faq: body.faq ?? [],
      schema_markup: body.schema_markup ?? "",
      status: "draft",
      target_date: body.target_date ?? new Date().toISOString().slice(0, 10),
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

// DELETE: 초안 삭제
export async function DELETE(request: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const supabase = createAdminClient();
  await supabase.from("frandoor_blog_drafts").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
