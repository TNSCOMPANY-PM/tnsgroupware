import { createAdminClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";

function isTableMissing(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return (msg.includes("kanban") && (msg.includes("schema cache") || msg.includes("does not exist") || msg.includes("relation"))) ?? false;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = createAdminClient();
    const { id } = await params;
    const body = await req.json();
    const { data, error } = await supabase
      .from("kanban_cards")
      .update(body)
      .eq("id", id)
      .select()
      .single();
    if (error) {
      if (isTableMissing(error)) {
        return NextResponse.json(
          { error: "kanban_cards 테이블이 없습니다. Supabase SQL Editor에서 supabase-kanban.sql을 실행해 주세요.", code: "KANBAN_TABLE_MISSING" },
          { status: 503 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data);
  } catch (e) {
    if (isTableMissing(e)) {
      return NextResponse.json(
        { error: "kanban_cards 테이블이 없습니다. Supabase SQL Editor에서 supabase-kanban.sql을 실행해 주세요.", code: "KANBAN_TABLE_MISSING" },
        { status: 503 }
      );
    }
    const err = e instanceof Error ? e : new Error(String(e));
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = createAdminClient();
    const { id } = await params;
    const { error } = await supabase.from("kanban_cards").delete().eq("id", id);
    if (error) {
      if (isTableMissing(error)) {
        return NextResponse.json(
          { error: "kanban_cards 테이블이 없습니다. Supabase SQL Editor에서 supabase-kanban.sql을 실행해 주세요.", code: "KANBAN_TABLE_MISSING" },
          { status: 503 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (isTableMissing(e)) {
      return NextResponse.json(
        { error: "kanban_cards 테이블이 없습니다. Supabase SQL Editor에서 supabase-kanban.sql을 실행해 주세요.", code: "KANBAN_TABLE_MISSING" },
        { status: 503 }
      );
    }
    const err = e instanceof Error ? e : new Error(String(e));
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
