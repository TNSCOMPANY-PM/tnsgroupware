/**
 * Naver 검색광고 API (검색광고센터) — 키워드도구 월간 검색량 조회.
 *
 * 필수 환경변수
 * - NAVER_SEARCHAD_CUSTOMER_ID
 * - NAVER_SEARCHAD_API_KEY     (액세스 라이선스)
 * - NAVER_SEARCHAD_SECRET      (비밀키, base64)
 *
 * 인증: HMAC-SHA256 서명
 *   signature = base64( HMAC-SHA256( secret, `${timestamp}.${method}.${path}` ) )
 */

import crypto from 'crypto';

const BASE_URL = 'https://api.searchad.naver.com';

export interface KeywordVolumeRaw {
  relKeyword: string;
  monthlyPcQcCnt: number | string;
  monthlyMobileQcCnt: number | string;
  monthlyAvePcClkCnt: number | string;
  monthlyAveMobileClkCnt: number | string;
  monthlyAvePcCtr: number | string;
  monthlyAveMobileCtr: number | string;
  plAvgDepth: number;
  compIdx: string;
}

export interface KeywordVolume {
  keyword: string;
  pc: number;
  mobile: number;
  total: number;
  compIdx: string;
  dataAsOf: string;
}

interface SearchAdCreds {
  customerId: string;
  apiKey: string;
  secret: string;
}

function getCreds(): SearchAdCreds {
  const customerId = process.env.NAVER_SEARCHAD_CUSTOMER_ID;
  const apiKey = process.env.NAVER_SEARCHAD_API_KEY;
  const secret = process.env.NAVER_SEARCHAD_SECRET;
  if (!customerId || !apiKey || !secret) {
    throw new Error(
      'NAVER_SEARCHAD_* env vars missing (CUSTOMER_ID / API_KEY / SECRET)'
    );
  }
  return { customerId, apiKey, secret };
}

function sign(
  timestamp: string,
  method: string,
  uri: string,
  secret: string
): string {
  const message = `${timestamp}.${method}.${uri}`;
  return crypto.createHmac('sha256', secret).update(message).digest('base64');
}

function parseNumeric(v: number | string): number {
  if (typeof v === 'number') return v;
  // 검색광고 API: 검색량이 10 미만이면 "< 10" 문자열로 반환
  if (v === '< 10') return 5;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * 키워드 목록의 월간 검색량 조회.
 * 한 번에 최대 5개 키워드. 초과 시 내부에서 배치.
 */
export async function fetchKeywordVolumes(
  keywords: string[]
): Promise<KeywordVolume[]> {
  const creds = getCreds();
  const results: KeywordVolume[] = [];
  const dataAsOf = new Date().toISOString().slice(0, 10);

  const BATCH = 5;
  for (let i = 0; i < keywords.length; i += BATCH) {
    const batch = keywords.slice(i, i + BATCH);
    const timestamp = Date.now().toString();
    const method = 'GET';
    const path = '/keywordstool';
    const hintKeywords = batch.map((k) => k.replace(/\s+/g, '')).join(',');
    const qs = `?hintKeywords=${encodeURIComponent(hintKeywords)}&showDetail=1`;
    const signature = sign(timestamp, method, path, creds.secret);

    const res = await fetch(`${BASE_URL}${path}${qs}`, {
      method,
      headers: {
        'X-Timestamp': timestamp,
        'X-API-KEY': creds.apiKey,
        'X-Customer': creds.customerId,
        'X-Signature': signature,
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(
        `NaverSearchAd ${res.status} ${res.statusText}: ${body.slice(0, 200)}`
      );
    }
    const json = (await res.json()) as { keywordList: KeywordVolumeRaw[] };
    const hintSet = new Set(batch.map((k) => k.replace(/\s+/g, '').toLowerCase()));

    for (const row of json.keywordList || []) {
      // 힌트 키워드와 정확히 일치하는 항목만 — relKeyword 확장 제외
      if (!hintSet.has(row.relKeyword.toLowerCase())) continue;
      const pc = parseNumeric(row.monthlyPcQcCnt);
      const mobile = parseNumeric(row.monthlyMobileQcCnt);
      results.push({
        keyword: row.relKeyword,
        pc,
        mobile,
        total: pc + mobile,
        compIdx: row.compIdx,
        dataAsOf,
      });
    }

    // 레이트리밋 (초당 수 회 제한 대비)
    if (i + BATCH < keywords.length) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  return results;
}
