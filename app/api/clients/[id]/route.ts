import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { id } = await params;
  const body = await req.json();
  const { data, error } = await supabase
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
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { id } = await params;
  const { error } = await supabase.from("clients").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
