import { createAdminClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";

export async function GET() {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("geo_brands")
    .select("*, geo_prompts(count), geo_check_runs(id, run_date, score, mentioned_count, total_prompts)")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(request: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const body = await request.json() as { name: string; landing_url?: string };
  if (!body.name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("geo_brands")
    .insert({ name: body.name.trim(), landing_url: body.landing_url?.trim() || null })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function PATCH(request: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const body = await request.json() as { id: string; fact_data?: { keyword: string; label: string }[]; fact_file_url?: string; landing_url?: string };
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const supabase = createAdminClient();
  const updates: Record<string, unknown> = {};
  if (body.fact_data !== undefined) updates.fact_data = body.fact_data;
  if (body.fact_file_url !== undefined) updates.fact_file_url = body.fact_file_url;
  if (body.landing_url !== undefined) updates.landing_url = body.landing_url;

  const { error } = await supabase.from("geo_brands").update(updates).eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
