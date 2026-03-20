import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const body = await req.json();
  const { data, error } = await supabase
    .from("clients")
    .insert({
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
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
