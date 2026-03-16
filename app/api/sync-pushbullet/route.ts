import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { parseShinhanDepositSms } from "@/lib/shinhanDepositParser";

export const dynamic = "force-dynamic";

type PushbulletPush = { body?: string; title?: string; created?: number; iden?: string; active?: boolean; type?: string; dismissed?: boolean };

/**
 * Pushbullet 동기화 API (GET).
 * PUSHBULLET_API_KEY로 최근 pushes 조회 → 신한 입금만 필터·파싱 → 중복 제외 후 finance INSERT.
 * Vercel Cron (매일 자정) 및 페이지 로드 시 자동 호출됨.
 */
export async function GET(request: NextRequest) {
  // Vercel Cron 인증 헤더 허용 (CRON_SECRET 미설정 시 전체 허용)
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const apiKey = process.env.PUSHBULLET_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "PUSHBULLET_API_KEY가 설정되지 않았습니다.", count: 0, added: [] },
      { status: 500 }
    );
  }

  try {
    // active=true: 삭제되지 않은 push만, limit=100으로 더 넓게 조회
    const res = await fetch("https://api.pushbullet.com/v2/pushes?active=true&limit=100", {
      headers: { "Access-Token": apiKey },
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return NextResponse.json(
        { ok: false, error: (err as { error?: { message?: string } }).error?.message ?? res.statusText, count: 0, added: [] },
        { status: res.status === 401 ? 401 : 502 }
      );
    }

    const data = (await res.json()) as { pushes?: PushbulletPush[] };
    const pushes = Array.isArray(data.pushes) ? data.pushes : [];

    console.log(`📦 [Pushbullet] 총 ${pushes.length}개 push 수신`);

    // 최근 20개 원본 구조 출력 (필터 전)
    pushes.slice(0, 20).forEach((p, i) => {
      console.log(`  [${i}] type=${p.type} | title=${JSON.stringify(p.title)} | body=${JSON.stringify(typeof p.body === "string" ? p.body.slice(0, 80) : p.body)}`);
    });

    // title + body 합쳐서 필터 (어느 쪽에 있어도 잡기)
    const shinhanPushes = pushes.filter((p) => {
      const combined = `${p.title ?? ""} ${p.body ?? ""}`;
      return combined.includes("신한") && combined.includes("입금");
    });

    console.log(`🔍 [필터] 신한+입금 포함 ${shinhanPushes.length}건`);

    // 파싱: title\nbody 합쳐서 파싱 + iden 포함
    const parsedList: { date: string; amount: number; client_name: string; iden?: string }[] = [];
    for (const p of shinhanPushes) {
      const text = [p.title, p.body].filter(Boolean).join("\n");
      console.log("🚨 [디버깅] 들어온 문자 원본:", JSON.stringify(text));
      const parsed = parseShinhanDepositSms(text);
      if (parsed) {
        console.log("✅ [파싱 성공]:", parsed);
        parsedList.push({ ...parsed, iden: p.iden });
      } else {
        console.error("❌ [파싱 실패] 원본 다시 확인:", JSON.stringify(text));
      }
    }

    if (parsedList.length === 0) {
      return NextResponse.json({ ok: true, count: 0, added: [], total: pushes.length, shinhan: shinhanPushes.length });
    }

    const supabase = await createClient();

    // 중복 체크: Pushbullet iden 기준 (description의 pb:XXX 태그)
    // iden이 DB에 없으면 무조건 신규 추가 — 날짜/금액 중복 여부 무관
    const { data: existing, error: existingError } = await supabase
      .from("finance")
      .select("description")
      .eq("type", "매출");

    if (existingError) {
      console.error("❌ [기존 데이터 조회 실패]:", existingError.message);
    }

    const existingIdens = new Set<string>(
      (existing ?? [])
        .map((r: Record<string, unknown>) => {
          const m = String(r.description ?? "").match(/pb:([a-zA-Z0-9._-]+)/);
          return m ? m[1] : null;
        })
        .filter((v): v is string => v !== null)
    );

    // iden이 없는 push(이론상 없음)는 amount+date 폴백
    const { data: existingFallback } = existingIdens.size === 0
      ? await supabase.from("finance").select("amount, date, month").eq("type", "매출")
      : { data: [] };

    const fallbackSet = new Set(
      (existingFallback ?? []).map((r: Record<string, unknown>) =>
        r.date ? `${r.amount}_${String(r.date).slice(0, 10)}` : `${r.amount}_${r.month}`
      )
    );

    const toInsert = parsedList.filter((p) => {
      // iden 있으면 iden 기준으로만 판단
      if (p.iden) return !existingIdens.has(p.iden);
      // iden 없으면 amount+date 폴백
      return !fallbackSet.has(`${p.amount}_${p.date}`);
    });

    console.log(`📊 [동기화] 파싱=${parsedList.length}건, 중복=${parsedList.length - toInsert.length}건, 신규=${toInsert.length}건`);

    const added: { date: string; amount: number; client_name: string }[] = [];

    for (const p of toInsert) {
      const month = p.date.slice(0, 7);

      // description에 pb:iden 태그 포함 (중복 체크 정확도 향상)
      const idenTag = p.iden ? ` pb:${p.iden}` : "";
      const descriptionValue = p.client_name
        ? `입금자: ${p.client_name}${idenTag}`
        : idenTag || null;

      // 새 컬럼 포함 INSERT 시도
      const { error } = await supabase.from("finance").insert({
        month,
        type: "매출",
        amount: p.amount,
        client_name: p.client_name || null,
        status: "pending",
        category: null,
        date: p.date,
        description: descriptionValue,
      } as Record<string, unknown>);

      if (!error) {
        console.log("✅ [DB INSERT 성공]:", p);
        added.push({ date: p.date, amount: p.amount, client_name: p.client_name });
        if (p.iden) existingIdens.add(p.iden);
        continue;
      }

      // 컬럼 없는 경우 폴백: 기본 컬럼만으로 INSERT
      console.warn("⚠️ [INSERT 실패, 폴백 시도]:", error.message);
      const { error: error2 } = await supabase.from("finance").insert({
        month,
        type: "매출",
        amount: p.amount,
        description: descriptionValue,
      } as Record<string, unknown>);

      if (!error2) {
        console.log("✅ [DB INSERT 성공 (폴백)]:", p);
        added.push({ date: p.date, amount: p.amount, client_name: p.client_name });
        if (p.iden) existingIdens.add(p.iden);
      } else {
        console.error("❌ [DB INSERT 최종 실패]:", error2.message, "데이터:", p);
      }
    }

    return NextResponse.json({ ok: true, count: added.length, added });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    return NextResponse.json(
      { ok: false, error: err.message, count: 0, added: [] },
      { status: 500 }
    );
  }
}
