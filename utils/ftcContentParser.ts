/**
 * 공정위 정보공개서 본문 XML → 숫자 팩트 추출.
 *
 * 주요 섹션 코드:
 *   AF_0204000000 : 최근 3년간 가맹점·직영점 수 (지역별, 연도별)
 *   AF_0205000000 : 최근 3년간 가맹점 수 추이 (연초/신규/종료/해지/명의변경/연말)
 *   AF_0207000000 : 직전연도 연간 평균 매출액 (지역별)
 *   AF_0401010000 : 최초 가맹금
 *   AF_0401020000 : 보증금
 *   AF_0401040000 : 기타 비용 (인테리어 등)
 *
 * 단위: 가맹점수(개), 금액(천원).
 */

import type { FtcContentSection } from "./ftcFranchise";

export type ExtractedFact = {
  label:
    | "가맹점수_전체"
    | "연평균매출액_전체"
    | "연평균매출액_하한"
    | "연평균매출액_상한"
    | "면적당매출_전체"
    | "신규개점_직전연도"
    | "계약종료_직전연도"
    | "계약해지_직전연도"
    | "가맹비"
    | "보증금"
    | "기타비용_총계"
    | "인테리어비"
    | "창업비용_총액";
  value: number;       // 정규화 숫자 (개 또는 천원)
  unit: "개" | "천원";
  yearLabel: string | null;  // 기준연도/시점
  sectionCode: string;
  raw: string;         // 매칭된 원문 스니펫 (디버깅용)
};

function stripTags(xml: string): string {
  return xml
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toNum(s: string): number {
  const n = Number(s.replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}

function findSection(
  sections: FtcContentSection[],
  codeOrAttr: string,
): FtcContentSection | null {
  return (
    sections.find(s => s.attrbSn === codeOrAttr) ??
    sections.find(s => s.attr === codeOrAttr) ??
    null
  );
}

// ───────────────────────────────────────────────
// AF_0204 : 가맹점 및 직영점 총 수 (지역별, 3년치)
// 패턴: "전체 <Y1_total> <Y1_frc> <Y1_dir> <Y2_total> <Y2_frc> <Y2_dir> <Y3_total> <Y3_frc> <Y3_dir>"
// 가장 최근 연도의 전체 가맹점수를 추출.
// ───────────────────────────────────────────────
function parseFrcsCount(sec: FtcContentSection): ExtractedFact[] {
  const text = stripTags(sec.rawXml);
  const facts: ExtractedFact[] = [];

  // 연도 헤더 추출 (예: 2021.12.31 2022.12.31 2023.12.31)
  const yrHeaders = [...text.matchAll(/(\d{4})\.\d{1,2}\.\d{1,2}/g)].map(m => m[1]);
  const latestYr = yrHeaders.length > 0 ? yrHeaders[yrHeaders.length - 1] : null;

  // "전체" 행: 9개 숫자 연속 (3년 × [전체/가맹점/직영])
  const m = text.match(/전체\s+((?:\d[\d,]*\s+){8}\d[\d,]*)/);
  if (m) {
    const nums = m[1].trim().split(/\s+/).map(toNum);
    if (nums.length >= 9) {
      facts.push({
        label: "가맹점수_전체",
        value: nums[7], // 최근연도의 가맹점수
        unit: "개",
        yearLabel: latestYr,
        sectionCode: sec.attrbSn,
        raw: m[0].slice(0, 100),
      });
    }
  }
  return facts;
}

// ───────────────────────────────────────────────
// AF_0205 : 연도별 가맹점 증감 (연초/신규/종료/해지/명의변경/연말)
// 패턴: "<yr> <연초> <신규> <종료> <해지> <명의> <연말>"
// 가장 최근 연도만 추출.
// ───────────────────────────────────────────────
function parseFrcsChurn(sec: FtcContentSection): ExtractedFact[] {
  const text = stripTags(sec.rawXml);
  const facts: ExtractedFact[] = [];
  const rows = [...text.matchAll(/(\d{4})\s+(\d[\d,]*)\s+(\d[\d,]*)\s+(\d[\d,]*)\s+(\d[\d,]*)\s+(\d[\d,]*)\s+(\d[\d,]*)/g)];
  if (rows.length === 0) return facts;
  const last = rows[rows.length - 1];
  const yr = last[1];
  const [, , , newCnt, endCnt, cancelCnt] = last;
  facts.push({
    label: "신규개점_직전연도", value: toNum(newCnt), unit: "개", yearLabel: yr,
    sectionCode: sec.attrbSn, raw: last[0].slice(0, 80),
  });
  facts.push({
    label: "계약종료_직전연도", value: toNum(endCnt), unit: "개", yearLabel: yr,
    sectionCode: sec.attrbSn, raw: last[0].slice(0, 80),
  });
  facts.push({
    label: "계약해지_직전연도", value: toNum(cancelCnt), unit: "개", yearLabel: yr,
    sectionCode: sec.attrbSn, raw: last[0].slice(0, 80),
  });
  return facts;
}

// ───────────────────────────────────────────────
// AF_0207 : 직전연도 연간 평균 매출액 (지역별)
// 패턴: 전체 <가맹점수> <연간평균매출> <면적당매출> <상한> <면적당상한> <하한> <면적당하한>
// 단위: 천원
// ───────────────────────────────────────────────
function parseAvgSales(sec: FtcContentSection): ExtractedFact[] {
  const text = stripTags(sec.rawXml);
  const facts: ExtractedFact[] = [];

  // 직전 사업연도 추출 (예: "직전 사업연도(2023년도)")
  const yrMatch = text.match(/직전\s*사업연도\s*\(\s*(\d{4})/);
  const yr = yrMatch ? yrMatch[1] : null;

  // 전체 행: 가맹점수 + 7개 숫자 (또는 '-')
  // "전체 12 257,079 13,862 431,754 37,378 136,503 5,733 -"
  const m = text.match(/전체\s+(\d[\d,]*)\s+([\d,\-]+)\s+([\d,\-]+)\s+([\d,\-]+)\s+([\d,\-]+)\s+([\d,\-]+)\s+([\d,\-]+)/);
  if (!m) return facts;
  const [raw, frcsCnt, avg, avgUnit, upper, upperUnit, lower, lowerUnit] = m;

  const push = (label: ExtractedFact["label"], s: string) => {
    if (s === "-" || !s) return;
    const v = toNum(s);
    if (v <= 0) return;
    facts.push({ label, value: v, unit: "천원", yearLabel: yr, sectionCode: sec.attrbSn, raw: raw.slice(0, 120) });
  };
  push("연평균매출액_전체", avg);
  push("면적당매출_전체", avgUnit);
  push("연평균매출액_상한", upper);
  push("연평균매출액_하한", lower);

  // frcsCnt, upperUnit, lowerUnit 는 현재 label 없어서 drop
  void frcsCnt; void upperUnit; void lowerUnit;
  return facts;
}

// ───────────────────────────────────────────────
// AF_0401010000 : 최초 가맹금
// "총계 <총액>" + "가맹비 <가맹비>" (천원)
// ───────────────────────────────────────────────
function parseJoinFee(sec: FtcContentSection): ExtractedFact[] {
  const text = stripTags(sec.rawXml);
  const facts: ExtractedFact[] = [];
  // 총계 <숫자>
  const total = text.match(/총계\s+(\d[\d,]*)/);
  // 가맹비 <숫자>
  const fee = text.match(/가맹비\s+(\d[\d,]*)/);
  if (fee) {
    facts.push({
      label: "가맹비", value: toNum(fee[1]), unit: "천원",
      yearLabel: null, sectionCode: sec.attrbSn, raw: fee[0],
    });
  } else if (total) {
    facts.push({
      label: "가맹비", value: toNum(total[1]), unit: "천원",
      yearLabel: null, sectionCode: sec.attrbSn, raw: total[0],
    });
  }
  return facts;
}

// ───────────────────────────────────────────────
// AF_0401020000 : 보증금
// ───────────────────────────────────────────────
function parseDeposit(sec: FtcContentSection): ExtractedFact[] {
  const text = stripTags(sec.rawXml);
  const facts: ExtractedFact[] = [];
  // 계약이행보증금 <숫자>  또는  총계 <숫자>
  const m =
    text.match(/계약이행보증금\s+(\d[\d,]*)/) ??
    text.match(/총계\s+(\d[\d,]*)/);
  if (m) {
    facts.push({
      label: "보증금", value: toNum(m[1]), unit: "천원",
      yearLabel: null, sectionCode: sec.attrbSn, raw: m[0],
    });
  }
  return facts;
}

// ───────────────────────────────────────────────
// AF_0401040000 : 기타비용 (인테리어 + 집기 + 간판 + 초도)
// ───────────────────────────────────────────────
function parseOtherCost(sec: FtcContentSection): ExtractedFact[] {
  const text = stripTags(sec.rawXml);
  const facts: ExtractedFact[] = [];
  const total = text.match(/총계\s+(\d[\d,]*)/);
  if (total) {
    facts.push({
      label: "기타비용_총계", value: toNum(total[1]), unit: "천원",
      yearLabel: null, sectionCode: sec.attrbSn, raw: total[0],
    });
  }
  // 인테리어 항목 (가장 큰 값 하나)
  const interiorMatches = [...text.matchAll(/인테리어[^\d]{0,30}?(\d{2,}[\d,]*)/g)];
  if (interiorMatches.length > 0) {
    const maxVal = Math.max(...interiorMatches.map(m => toNum(m[1])));
    facts.push({
      label: "인테리어비", value: maxVal, unit: "천원",
      yearLabel: null, sectionCode: sec.attrbSn, raw: interiorMatches[0][0],
    });
  }
  return facts;
}

// ───────────────────────────────────────────────
// 총 창업비용 = 가맹비 + 보증금 + 기타비용
// ───────────────────────────────────────────────
function computeTotal(facts: ExtractedFact[]): ExtractedFact | null {
  const joinFee = facts.find(f => f.label === "가맹비")?.value ?? 0;
  const deposit = facts.find(f => f.label === "보증금")?.value ?? 0;
  const other = facts.find(f => f.label === "기타비용_총계")?.value ?? 0;
  const total = joinFee + deposit + other;
  if (total <= 0) return null;
  return {
    label: "창업비용_총액",
    value: total,
    unit: "천원",
    yearLabel: null,
    sectionCode: "COMPUTED",
    raw: `가맹비(${joinFee}) + 보증금(${deposit}) + 기타(${other})`,
  };
}

// ───────────────────────────────────────────────
// 진입점
// ───────────────────────────────────────────────
export function extractFactsFromContent(sections: FtcContentSection[]): ExtractedFact[] {
  const facts: ExtractedFact[] = [];

  const frcsSec = findSection(sections, "AF_0204000000") ?? findSection(sections, "RB_TTYR_BSN_FRCS_DMS_CNT");
  if (frcsSec) facts.push(...parseFrcsCount(frcsSec));

  const churnSec = findSection(sections, "AF_0205000000") ?? findSection(sections, "RB_TTYR_FRCS_CNT");
  if (churnSec) facts.push(...parseFrcsChurn(churnSec));

  const salesSec = findSection(sections, "AF_0207000000") ?? findSection(sections, "RB_BIZ_YR_FYER_AVRG_SLS_AMT");
  if (salesSec) facts.push(...parseAvgSales(salesSec));

  const feeSec = findSection(sections, "AF_0401010000") ?? findSection(sections, "FRCS_BZMN_FRST_JNNT_INFO");
  if (feeSec) facts.push(...parseJoinFee(feeSec));

  const depositSec = findSection(sections, "AF_0401020000") ?? findSection(sections, "FRCS_BZMN_ASSRNC_AMT_INFO");
  if (depositSec) facts.push(...parseDeposit(depositSec));

  const otherSec = findSection(sections, "AF_0401040000") ?? findSection(sections, "FRCS_BZMN_ADDM_CT_INFO");
  if (otherSec) facts.push(...parseOtherCost(otherSec));

  const total = computeTotal(facts);
  if (total) facts.push(total);

  return facts;
}
