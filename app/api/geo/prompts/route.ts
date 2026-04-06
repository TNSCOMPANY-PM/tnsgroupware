import { createAdminClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";

export async function GET(request: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const { searchParams } = new URL(request.url);
  const brandId = searchParams.get("brand_id");
  if (!brandId) return NextResponse.json({ error: "brand_id required" }, { status: 400 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("geo_prompts")
    .select("*")
    .eq("brand_id", brandId)
    .order("sort_order");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(request: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const body = await request.json() as { brand_id: string; prompt_text: string; category?: string };
  if (!body.brand_id || !body.prompt_text?.trim()) return NextResponse.json({ error: "brand_id and prompt_text required" }, { status: 400 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("geo_prompts")
    .insert({ brand_id: body.brand_id, prompt_text: body.prompt_text.trim(), category: body.category?.trim() || null })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(request: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const supabase = createAdminClient();
  const { error } = await supabase.from("geo_prompts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
