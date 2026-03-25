import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("announcements")
    .select("*")
    .order("date", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: Request) {
  const supabase = createAdminClient();
  const body = await req.json();
  const id = body.id ?? `ann-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const { data, error } = await supabase
    .from("announcements")
    .insert({
      id,
      title: body.title,
      body: body.body ?? null,
      date: body.date,
      is_important: body.isImportant ?? false,
      author_id: body.authorId ?? null,
      author_name: body.authorName ?? null,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
