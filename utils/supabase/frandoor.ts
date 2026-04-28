import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * PR056 — frandoor 별도 supabase 프로젝트 client (ftc_brands_2024 적재).
 * URL/key 미설정 시 throw — 호출자가 try/catch 또는 isFrandoorConfigured 로 사전 점검.
 *
 * PR060 — env 값 정규화 (따옴표·zero-width·whitespace·protocol 누락 자동 정정).
 *         FTC_DEBUG=1 일 때 production 에서도 디테일 로그 출력 (URL/KEY 일부만, 보안).
 */

/** 보이지 않는 문자 패턴: zero-width space / joiner / no-break space / BOM 등. */
const INVISIBLE_RE = /[​-‍﻿ ]/g;

/**
 * env URL 정규화. 보이지 않는 문자·따옴표·protocol 누락 등 흔한 실수 자동 정정.
 * 반환: 정규화된 URL 또는 null (값 비어있을 때).
 */
export function normalizeFrandoorUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  let s = raw.trim();
  // 양쪽 따옴표 제거 (single/double)
  s = s.replace(/^["']|["']$/g, "");
  // 보이지 않는 문자 제거 (zero-width / NBSP / BOM)
  s = s.replace(INVISIBLE_RE, "");
  // 모든 whitespace (중간 공백 / 탭 / 줄바꿈) 제거 — URL 에 정상 포함 안 됨
  s = s.replace(/\s+/g, "");
  // protocol 누락 시 https:// prepend
  if (s && !/^https?:\/\//i.test(s)) {
    s = `https://${s}`;
  }
  // trailing slash 제거
  s = s.replace(/\/+$/, "");
  return s || null;
}

/**
 * env KEY (service_role JWT) 정규화. 따옴표/zero-width/줄바꿈 제거.
 * JWT 자체는 base64url 이라 공백 없음.
 */
export function normalizeFrandoorKey(raw: string | undefined): string | null {
  if (!raw) return null;
  let s = raw.trim();
  s = s.replace(/^["']|["']$/g, "");
  s = s.replace(INVISIBLE_RE, "");
  s = s.replace(/[\r\n]+/g, "");
  return s || null;
}

export function isFrandoorConfigured(): boolean {
  const url = normalizeFrandoorUrl(process.env.FRANDOOR_SUPABASE_URL);
  const key = normalizeFrandoorKey(process.env.FRANDOOR_SUPABASE_SERVICE_ROLE_KEY);
  return !!(url && key);
}

let _logged = false;
function maybeLogDetail(url: string | null, key: string | null): void {
  // dev/preview 환경에서 항상 / production 에서는 FTC_DEBUG=1 일 때만.
  // 1회만 로그 (호출 폭주 방지).
  if (_logged) return;
  if (process.env.NODE_ENV !== "production" || process.env.FTC_DEBUG === "1") {
    console.log(
      `[frandoor.client] URL.len=${url?.length ?? 0} starts="${url?.slice(0, 8) ?? ""}" ends="${url?.slice(-12) ?? ""}" ` +
        `KEY.len=${key?.length ?? 0} starts="${key?.slice(0, 6) ?? ""}" ends="${key?.slice(-6) ?? ""}"`,
    );
    _logged = true;
  }
}

export function createFrandoorClient(): SupabaseClient {
  const rawUrl = process.env.FRANDOOR_SUPABASE_URL;
  const rawKey = process.env.FRANDOOR_SUPABASE_SERVICE_ROLE_KEY;
  const url = normalizeFrandoorUrl(rawUrl);
  const key = normalizeFrandoorKey(rawKey);

  maybeLogDetail(url, key);

  if (!url || !key) {
    throw new Error(
      `FRANDOOR env 미설정 (url=${!!url} / key=${!!key}). raw_url_len=${rawUrl?.length ?? 0} raw_key_len=${rawKey?.length ?? 0}`,
    );
  }

  // URL 형식 검증 — invalid 시 명확한 메시지 (앞 30자만 노출, 보안)
  try {
    new URL(url);
  } catch {
    throw new Error(
      `FRANDOOR_SUPABASE_URL invalid: "${url.slice(0, 30)}..." (len=${url.length})`,
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
