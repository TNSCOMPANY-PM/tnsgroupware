import { createAdminClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createAdminClient();
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
    .select("id, date, amount, type, status, category, client_name, description, deposit_time, created_at")
    .in("client_name", names)
    .order("date", { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // deposit_time 기반 중복 제거: (date, amount, type, deposit_time)이 같으면 1건만
  const seen = new Set<string>();
  const deduped = (data ?? []).filter((r) => {
    const dt = (r as Record<string, unknown>).deposit_time as string | null;
    if (!dt) return true; // deposit_time 없으면 그대로 포함
    const key = `${r.date}_${r.amount}_${r.type}_${dt}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return NextResponse.json(deduped);
}
