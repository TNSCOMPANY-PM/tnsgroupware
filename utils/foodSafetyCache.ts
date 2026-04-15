import { createAdminClient } from "@/utils/supabase/admin";

const TTL_MS = 24 * 60 * 60 * 1000;

export function buildCacheKey(serviceId: string, conditions: Record<string, string>): string {
  const sorted = Object.keys(conditions).sort().map(k => `${k}=${conditions[k]}`).join("&");
  return `${serviceId}:${sorted}`;
}

/**
 * Supabase foodsafety_cache 기반 24h TTL 캐시.
 * 테이블 부재 시 fetcher 로 pass-through.
 * 재판매 금지 조항: 원 응답은 내부 캐시만, 외부 API 로 재노출 금지.
 */
export async function getCachedOrFetch<T>(
  cacheKey: string,
  fetcher: () => Promise<T>,
): Promise<T> {
  const supabase = createAdminClient();

  try {
    const { data, error } = await supabase
      .from("foodsafety_cache")
      .select("payload, fetched_at")
      .eq("cache_key", cacheKey)
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
    await supabase.from("foodsafety_cache").upsert({
      cache_key: cacheKey,
      payload: fresh,
      fetched_at: new Date().toISOString(),
    });
  } catch {
    // 저장 실패는 조용히 무시
  }

  return fresh;
}
