import { createAdminClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const supabase = createAdminClient();
  const { id } = await params;
  const body = await req.json();
  const { error } = await supabase
    .from("clients")
    .update({
      name: body.name,
      category: body.category ?? null,
      aliases: body.aliases ?? [],
      contact: body.contact ?? null,
      notes: body.notes ?? null,
      business_number: body.business_number ?? null,
      representative: body.representative ?? null,
      address: body.address ?? null,
      business_type: body.business_type ?? null,
      business_item: body.business_item ?? null,
      email: body.email ?? null,
    })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const supabase = createAdminClient();
  const { id } = await params;
  const { error } = await supabase.from("clients").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
