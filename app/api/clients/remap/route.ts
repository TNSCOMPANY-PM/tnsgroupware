import { createAdminClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";
import { matchClient, type ClientForMatch } from "@/lib/clientMatcher";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";

export async function POST() {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const supabase = createAdminClient();

  // 모든 clients 가져오기
  const { data: clients, error: clientsErr } = await supabase
    .from("clients")
    .select("id, name, category, aliases, representative");
  if (clientsErr) return NextResponse.json({ error: clientsErr.message }, { status: 500 });

  const clientsForMatch = (clients ?? []) as ClientForMatch[];

  // 정확 alias 매핑 테이블
  const aliasMap = new Map<string, { name: string; category: string | null }>();
  for (const c of clientsForMatch) {
    aliasMap.set(c.name.trim(), { name: c.name, category: c.category });
    for (const alias of c.aliases ?? []) {
      if (alias) aliasMap.set(alias.trim(), { name: c.name, category: c.category });
    }
    if (c.representative) aliasMap.set(c.representative.trim(), { name: c.name, category: c.category });
  }

  // client_name이 있는 모든 finance 행 조회 (승인 여부 관계없이)
  const { data: rows, error: rowsErr } = await supabase
    .from("finance")
    .select("id, client_name, category")
    .not("client_name", "is", null)
    .neq("client_name", "");
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

    // 이미 동일하게 매핑된 경우 스킵
    if (row.client_name === matchResult.name && row.category === matchResult.category) continue;

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
