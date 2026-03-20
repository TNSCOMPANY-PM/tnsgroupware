import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

export async function POST() {
  const supabase = await createClient();

  // 모든 clients 가져오기
  const { data: clients, error: clientsErr } = await supabase
    .from("clients")
    .select("id, name, category, aliases");
  if (clientsErr) return NextResponse.json({ error: clientsErr.message }, { status: 500 });

  // 매핑 테이블: alias → { name, category }
  const aliasMap = new Map<string, { name: string; category: string | null }>();
  for (const c of clients ?? []) {
    for (const alias of c.aliases ?? []) {
      if (alias) aliasMap.set(alias.trim(), { name: c.name, category: c.category });
    }
  }

  // 미매핑 finance 행 조회 (category 없거나 pending 상태)
  const { data: rows, error: rowsErr } = await supabase
    .from("finance")
    .select("id, client_name, category")
    .is("category", null);
  if (rowsErr) return NextResponse.json({ error: rowsErr.message }, { status: 500 });

  let updated = 0;
  for (const row of rows ?? []) {
    const raw = (row.client_name ?? "").trim();
    if (!raw) continue;
    const match = aliasMap.get(raw);
    if (!match) continue;

    const { error: upErr } = await supabase
      .from("finance")
      .update({
        client_name: match.name,
        category: match.category,
      })
      .eq("id", row.id);
    if (!upErr) updated++;
  }

  return NextResponse.json({ ok: true, updated });
}
