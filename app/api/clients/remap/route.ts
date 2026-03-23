import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { matchClient, type ClientForMatch } from "@/lib/clientMatcher";

export async function POST() {
  const supabase = await createClient();

  // 모든 clients 가져오기
  const { data: clients, error: clientsErr } = await supabase
    .from("clients")
    .select("id, name, category, aliases");
  if (clientsErr) return NextResponse.json({ error: clientsErr.message }, { status: 500 });

  const clientsForMatch = (clients ?? []) as ClientForMatch[];

  // 정확 alias 매핑 테이블
  const aliasMap = new Map<string, { name: string; category: string | null }>();
  for (const c of clientsForMatch) {
    aliasMap.set(c.name.trim(), { name: c.name, category: c.category });
    for (const alias of c.aliases ?? []) {
      if (alias) aliasMap.set(alias.trim(), { name: c.name, category: c.category });
    }
  }

  // 미매핑 finance 행 조회 (category 없는 행)
  const { data: rows, error: rowsErr } = await supabase
    .from("finance")
    .select("id, client_name, category")
    .is("category", null);
  if (rowsErr) return NextResponse.json({ error: rowsErr.message }, { status: 500 });

  let updated = 0;
  for (const row of rows ?? []) {
    const raw = (row.client_name ?? "").trim();
    if (!raw) continue;

    // 1차: 정확 alias/name 매칭
    let matchResult = aliasMap.get(raw);

    // 2차: 퍼지 매칭
    if (!matchResult) {
      const fuzzy = matchClient(raw, clientsForMatch);
      if (fuzzy) {
        matchResult = { name: fuzzy.client.name, category: fuzzy.client.category };
      }
    }

    if (!matchResult) continue;

    const { error: upErr } = await supabase
      .from("finance")
      .update({
        client_name: matchResult.name,
        category: matchResult.category,
      })
      .eq("id", row.id);
    if (!upErr) updated++;
  }

  return NextResponse.json({ ok: true, updated });
}
