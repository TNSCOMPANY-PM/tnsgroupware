import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { id } = await params;
  const body = await req.json();
  const { data, error } = await supabase
    .from("approvals")
    .update(body)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

/** 결재 기록은 보존 정책으로 삭제 불가 */
export async function DELETE() {
  return NextResponse.json(
    { error: "결재 기록은 삭제할 수 없습니다. 전체 기록이 보존됩니다." },
    { status: 405 }
  );
}
