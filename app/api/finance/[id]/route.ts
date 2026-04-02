import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "id가 없습니다." }, { status: 400 });
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("finance")
    .select("receipt_data")
    .eq("id", id)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionEmployee();
    if (!session) return unauthorized();

    const { id } = await params;
    if (!id) return NextResponse.json({ ok: false, error: "id가 없습니다." }, { status: 400 });
    const body = await request.json().catch(() => ({}));
    const supabase = createAdminClient();
    const { error } = await supabase.from("finance").update(body).eq("id", id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionEmployee();
    if (!session) return unauthorized();

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ ok: false, error: "id가 없습니다." }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { error } = await supabase.from("finance").delete().eq("id", id);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
