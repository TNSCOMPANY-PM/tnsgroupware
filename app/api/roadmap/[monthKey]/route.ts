import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";

type Params = { params: Promise<{ monthKey: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    const { monthKey } = await params;
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("roadmap_data")
      .select("blocks")
      .eq("month_key", monthKey)
      .maybeSingle();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, blocks: data?.blocks ?? null });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: Params) {
  try {
    const { monthKey } = await params;
    const { blocks } = await req.json();
    const supabase = createAdminClient();
    const { error } = await supabase
      .from("roadmap_data")
      .upsert({ month_key: monthKey, blocks, updated_at: new Date().toISOString() }, { onConflict: "month_key" });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
