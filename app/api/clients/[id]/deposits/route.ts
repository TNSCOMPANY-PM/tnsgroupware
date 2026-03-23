import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id } = await params;

  // 거래처 정보 조회 (name + aliases)
  const { data: client, error: clientErr } = await supabase
    .from("clients")
    .select("name, aliases")
    .eq("id", id)
    .single();
  if (clientErr || !client) {
    return NextResponse.json({ error: "거래처를 찾을 수 없습니다." }, { status: 404 });
  }

  // 업체명 + 모든 별칭으로 finance 조회
  const names = [client.name, ...(client.aliases ?? [])].filter(Boolean);

  const { data, error } = await supabase
    .from("finance")
    .select("id, date, amount, type, status, category, client_name, description, created_at")
    .in("client_name", names)
    .order("date", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
