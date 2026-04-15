import { createAdminClient } from "@/utils/supabase/admin";

const TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Supabase kosis_cache (tbl_id, prd_de) 기반 24h TTL 캐시.
 * 테이블 부재 시 fetcher 만 실행하고 조용히 pass-through.
 * 재판매 금지 조항 대응: 원 응답은 내부 저장만, 외부 API 로 그대로 재노출 금지.
 */
export async function getCachedOrFetch<T>(
  tblId: string,
  prdDe: string,
  fetcher: () => Promise<T>,
): Promise<T> {
  const supabase = createAdminClient();

  try {
    const { data, error } = await supabase
      .from("kosis_cache")
      .select("payload, fetched_at")
      .eq("tbl_id", tblId)
      .eq("prd_de", prdDe)
      .maybeSingle();

    if (!error && data) {
      const ageMs = Date.now() - new Date(data.fetched_at).getTime();
      if (ageMs < TTL_MS) return data.payload as T;
    }
  } catch {
    // 테이블 미존재 / 네트워크 이슈 — fetcher 로 진행
  }

  const fresh = await fetcher();

  try {
    await supabase.from("kosis_cache").upsert({
      tbl_id: tblId,
      prd_de: prdDe,
      payload: fresh,
      fetched_at: new Date().toISOString(),
    });
  } catch {
    // 저장 실패는 조용히 무시 — 호출은 이미 성공
  }

  return fresh;
}
