import { assertWhitelistedUrl, isWhitelistedUrl } from "@/utils/publicSourceWhitelist";

/**
 * 화이트리스트 도메인만 허용하는 fetch 래퍼.
 * 호출 전 URL 을 검증하고, 리다이렉트 Location 도 검증한다.
 */
export async function guardedFetch(url: string, init?: RequestInit): Promise<Response> {
  assertWhitelistedUrl(url);
  const res = await fetch(url, { ...init, redirect: "manual" });

  if (res.status >= 300 && res.status < 400) {
    const loc = res.headers.get("location");
    if (!loc) return res;
    const nextUrl = new URL(loc, url).toString();
    if (!isWhitelistedUrl(nextUrl)) {
      throw new Error(`[fetchGuard] 리다이렉트 차단: ${nextUrl}`);
    }
    return guardedFetch(nextUrl, init);
  }

  return res;
}
