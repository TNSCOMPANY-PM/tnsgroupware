/**
 * 국세청 사업자등록정보 진위확인 및 상태조회 API
 * 호출 한도: 일 10,000건 (공공데이터포털 기준)
 * 기준문서: https://www.data.go.kr/data/15081808
 */

import type { NtsBusinessStatus } from "@/types/publicApi";

const BASE = "https://api.odcloud.kr/api/nts-businessman/v1";

function getKey(): string | null {
  return process.env.NTS_API_KEY ?? null;
}

function cleanBizNo(s: string): string {
  return s.replace(/[^0-9]/g, "");
}

export async function fetchBusinessStatus(bizNos: string[]): Promise<NtsBusinessStatus[]> {
  const key = getKey();
  if (!key) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[ntsApi] NTS_API_KEY 미설정");
    }
    return [];
  }
  const cleaned = bizNos.map(cleanBizNo).filter(b => b.length === 10);
  if (cleaned.length === 0) return [];

  const results: NtsBusinessStatus[] = [];
  for (let i = 0; i < cleaned.length; i += 100) {
    const chunk = cleaned.slice(i, i + 100);
    try {
      const r = await fetch(`${BASE}/status?serviceKey=${encodeURIComponent(key)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({ b_no: chunk }),
      });
      if (!r.ok) continue;
      const data = (await r.json()) as {
        data?: Array<Record<string, string>>;
      };
      for (const item of data.data ?? []) {
        results.push({
          bizNo: item.b_no ?? "",
          taxType: item.tax_type ?? "",
          taxTypeCode: item.tax_type_cd ?? "",
          businessStatus: item.b_stt ?? "",
          closedAt: item.end_dt ?? "",
          raw: item,
        });
      }
    } catch {
      continue;
    }
  }
  return results;
}

export async function validateBusiness(inputs: Array<{
  bizNo: string; startDate: string; principalName: string;
  corpName?: string; bizName?: string;
}>): Promise<Array<{ bizNo: string; valid: boolean; message: string }>> {
  const key = getKey();
  if (!key || inputs.length === 0) return [];
  try {
    const r = await fetch(`${BASE}/validate?serviceKey=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        businesses: inputs.map(i => ({
          b_no: cleanBizNo(i.bizNo),
          start_dt: i.startDate.replace(/-/g, ""),
          p_nm: i.principalName,
          corp_nm: i.corpName ?? "",
          b_nm: i.bizName ?? "",
        })),
      }),
    });
    if (!r.ok) return [];
    const data = (await r.json()) as { data?: Array<Record<string, string>> };
    return (data.data ?? []).map(d => ({
      bizNo: d.b_no ?? "",
      valid: d.valid === "01" || d.valid === "1",
      message: d.valid_msg ?? "",
    }));
  } catch {
    return [];
  }
}
