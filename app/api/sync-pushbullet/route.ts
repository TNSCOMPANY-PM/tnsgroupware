import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { parseShinhanDepositSms } from "@/lib/shinhanDepositParser";
import { matchClient, type ClientForMatch } from "@/lib/clientMatcher";

export const dynamic = "force-dynamic";

type PushbulletPush = { body?: string; title?: string; created?: number; iden?: string; active?: boolean; type?: string; dismissed?: boolean };
type PushbulletDevice = { iden?: string; nickname?: string; type?: string };
type PermanentsThread = { id?: string; recipients?: { name?: string; address?: string }[]; latest?: { id?: string; type?: string; body?: string; direction?: string; timestamp?: number } };

/**
 * Pushbullet 동기화 API (GET).
 * - (1) /v2/pushes: 사용자가 보낸 push 중 신한 입금 알림만 파싱
 * - (2) /v2/devices + /v2/permanents/{device}_threads: 실제 SMS 스레드에서 수신 문자 조회 (비공식 API)
 * 참고: https://www.pushbullet.com/#sms/... 같은 웹 페이지는 SPA라 서버에서 크롤링 불가(로그인·JS 렌더 필요).
 */
export async function GET(request: NextRequest) {
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

  const headers = { "Access-Token": apiKey };
  const parsedList: { date: string; amount: number; client_name: string; iden?: string; time?: string }[] = [];
  let pushesCount = 0;
  let shinhanFromPushes = 0;
  let smsThreadsFetched = 0;
  let permanentsError: string | null = null;

  try {
    // ── (1) Pushes: 사용자 push 목록 (노트/링크 등 — SMS는 여기 없을 수 있음) ──
    const res = await fetch("https://api.pushbullet.com/v2/pushes?active=true&limit=100", {
      headers,
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
    pushesCount = pushes.length;
    console.log(`📦 [Pushbullet] 총 ${pushes.length}개 push 수신`);

    const shinhanPushes = pushes.filter((p) => {
      const combined = `${p.title ?? ""} ${p.body ?? ""}`;
      return combined.includes("신한") && combined.includes("입금");
    });
    shinhanFromPushes = shinhanPushes.length;
    console.log(`🔍 [필터] pushes 중 신한+입금 ${shinhanPushes.length}건`);

    for (const p of shinhanPushes) {
      const text = [p.title, p.body].filter(Boolean).join("\n");
      const parsed = parseShinhanDepositSms(text);
      if (parsed) parsedList.push({ ...parsed, iden: p.iden });
    }

    // ── (2) SMS 스레드(permanents, 비공식): 실제 수신 문자에서 신한 입금 추출 ──
    try {
      const devRes = await fetch("https://api.pushbullet.com/v2/devices", { headers, next: { revalidate: 0 } });
      if (!devRes.ok) {
        permanentsError = `devices ${devRes.status}`;
        throw new Error(permanentsError);
      }
      const devData = (await devRes.json()) as { devices?: PushbulletDevice[] };
      const devices = Array.isArray(devData.devices) ? devData.devices : [];
      const androidDevices = devices.filter((d) => d.type === "android" || (d.iden && !d.type));
      if (androidDevices.length === 0) permanentsError = "Android 기기 없음";

      for (const dev of androidDevices.slice(0, 3)) {
        const iden = dev.iden;
        if (!iden) continue;
        const permRes = await fetch(`https://api.pushbullet.com/v2/permanents/${iden}_threads`, {
          headers,
          next: { revalidate: 0 },
        });
        if (!permRes.ok) {
          permanentsError = `permanents ${permRes.status}`;
          console.warn(`⚠️ [Pushbullet] permanents/${iden}_threads → ${permRes.status}`);
          continue;
        }
        const rawThreads = await permRes.json();
        const threads = Array.isArray(rawThreads) ? rawThreads : (rawThreads as { threads?: PermanentsThread[] }).threads ?? [];
        smsThreadsFetched += threads.length;
        for (const t of threads) {
          const latest = (t as PermanentsThread).latest;
          if (!latest?.body || latest.direction !== "incoming") continue;
          const text = latest.body;
          if (!text.includes("신한") || !text.includes("입금")) continue;
          const parsed = parseShinhanDepositSms(text);
          if (parsed) {
            const idenSms = `sms:${iden}:${(t as PermanentsThread).id ?? ""}:${latest.id ?? ""}`;
            if (!parsedList.some((x) => x.iden === idenSms)) parsedList.push({ ...parsed, iden: idenSms });
          } else {
            console.warn("⚠️ [Pushbullet] 신한 입금 파싱 실패, 원문 일부:", text.slice(0, 120));
          }
        }
      }
      if (smsThreadsFetched > 0) console.log(`📱 [SMS 스레드] ${smsThreadsFetched}개 스레드에서 신한 입금 파싱 반영`);
    } catch (permanentErr) {
      const msg = permanentErr instanceof Error ? permanentErr.message : String(permanentErr);
      if (!permanentsError) permanentsError = msg;
      console.warn("⚠️ [permanents SMS 조회 실패 (비공식 API)]:", permanentErr);
    }

    if (parsedList.length === 0) {
      return NextResponse.json({
        ok: true,
        count: 0,
        added: [],
        total: pushesCount,
        shinhan: shinhanFromPushes,
        sms_threads: smsThreadsFetched,
        permanents_error: permanentsError ?? undefined,
      });
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
          const m = String(r.description ?? "").match(/pb:([a-zA-Z0-9._:-]+)/);
          return m ? m[1] : null;
        })
        .filter((v): v is string => v !== null)
    );

    // amount+date+time 폴백 로드 (시간 있으면 시간까지, 없으면 amount+date만 비교)
    const { data: existingFallback } = await supabase
      .from("finance")
      .select("amount, date, month, description")
      .eq("type", "매출");

    // description에서 raw 입금자 이름 추출 ("입금자: XXX t:" 패턴)
    const extractRawName = (desc: string): string => {
      const m = String(desc).match(/^입금자:\s*(.+?)(?:\s+t:|\s+pb:|$)/);
      return m ? m[1].trim() : "";
    };

    // 시간 있는 항목: amount_date_HH:MM_rawName, 없는 항목: amount_date
    const fallbackWithTime = new Set(
      (existingFallback ?? [])
        .map((r: Record<string, unknown>) => {
          const desc = String(r.description ?? "");
          const timeMatch = desc.match(/t:(\d{2}:\d{2})/);
          if (!timeMatch) return null;
          const rawName = extractRawName(desc);
          const base = r.date ? `${r.amount}_${String(r.date).slice(0, 10)}` : `${r.amount}_${r.month}`;
          return `${base}_${timeMatch[1]}_${rawName}`;
        })
        .filter((v): v is string => v !== null)
    );
    const fallbackNoTime = new Set(
      (existingFallback ?? []).map((r: Record<string, unknown>) =>
        r.date ? `${r.amount}_${String(r.date).slice(0, 10)}` : `${r.amount}_${r.month}`
      )
    );

    const toInsert = parsedList.filter((p) => {
      // iden이 DB에 있으면 명확한 중복
      if (p.iden && existingIdens.has(p.iden)) return false;
      if (p.time) {
        // 시간 있으면 amount+date+time+rawName 모두 일치해야 중복
        if (fallbackWithTime.has(`${p.amount}_${p.date}_${p.time}_${p.client_name ?? ""}`)) return false;
      } else {
        // 시간 없으면 amount+date만으로 차단
        if (fallbackNoTime.has(`${p.amount}_${p.date}`)) return false;
      }
      return true;
    });

    console.log(`📊 [동기화] 파싱=${parsedList.length}건, 중복=${parsedList.length - toInsert.length}건, 신규=${toInsert.length}건`);

    const added: { date: string; amount: number; client_name: string }[] = [];

    // 루프 전 clients 전체 1회 로드 (퍼지 매칭용)
    const { data: allClients } = await supabase.from("clients").select("id, name, category, aliases");
    const clientsForMatch = (allClients ?? []) as ClientForMatch[];

    for (const p of toInsert) {
      const month = p.date.slice(0, 7);

      // clients 매핑: 정확 alias → 퍼지 매칭 순서로 시도
      let finalClientName = p.client_name || null;
      let autoCategory: string | null = null;
      if (finalClientName) {
        // 1차: 정확 alias 매칭
        const exactClient = clientsForMatch.find((c) =>
          c.aliases.some((a) => a.trim() === finalClientName)
        );
        if (exactClient) {
          finalClientName = exactClient.name;
          autoCategory = exactClient.category;
        } else {
          // 2차: 퍼지 매칭
          const fuzzy = matchClient(finalClientName, clientsForMatch);
          if (fuzzy) {
            finalClientName = fuzzy.client.name;
            autoCategory = fuzzy.client.category;
          }
        }
      }

      // description에 raw 이름 + 시간 태그 + pb:iden 태그 포함
      const rawName = p.client_name || "";
      const timeTag = p.time ? ` t:${p.time}` : "";
      const idenTag = p.iden ? ` pb:${p.iden}` : "";
      const descriptionValue = rawName
        ? `입금자: ${rawName}${timeTag}${idenTag}`
        : `${timeTag}${idenTag}`.trim() || null;

      // 같은 날+금액+시간+이름 기존 항목이 있으면 INSERT 대신 iden 업데이트
      if (p.iden && p.time) {
        let sameTimeQuery = supabase
          .from("finance")
          .select("id, description")
          .eq("amount", p.amount)
          .eq("date", p.date)
          .eq("type", "매출")
          .like("description", `%t:${p.time}%`);
        if (rawName) sameTimeQuery = sameTimeQuery.ilike("description", `%${rawName}%`);
        const { data: sameTime } = await sameTimeQuery.maybeSingle();
        if (sameTime) {
          const existDesc = String(sameTime.description ?? "");
          if (!existDesc.includes(`pb:${p.iden}`)) {
            await supabase.from("finance")
              .update({ description: `${existDesc} pb:${p.iden}`.trim() })
              .eq("id", (sameTime as Record<string, unknown>).id as string);
          }
          existingIdens.add(p.iden);
          continue;
        }
      }

      // 새 컬럼 포함 INSERT 시도
      const { error } = await supabase.from("finance").insert({
        month,
        type: "매출",
        amount: p.amount,
        client_name: finalClientName,
        status: "pending",
        category: autoCategory,
        date: p.date,
        description: descriptionValue,
        deposit_time: p.time ?? null,
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

    return NextResponse.json({
      ok: true,
      count: added.length,
      added,
      total: pushesCount,
      shinhan: shinhanFromPushes,
      sms_threads: smsThreadsFetched,
      permanents_error: permanentsError ?? undefined,
    });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    return NextResponse.json(
      { ok: false, error: err.message, count: 0, added: [] },
      { status: 500 }
    );
  }
}
