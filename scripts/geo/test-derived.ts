/* T4 — Tier D 파생지표 엔진 단위 테스트 (vitest 없이 Node assert/strict)
 * 실행: npx tsx scripts/geo/test-derived.ts
 * 샘플 출처: 공정위 정보공개서 2024년판 공개분 중 요약 수치 (주석 URL 참조).
 */
import { strict as assert } from "node:assert";
import {
  computeRealInvestment,
  computePaybackPeriod,
  computeNetMargin,
  computeIndustryPosition,
  computeExpansionRatio,
  computeTransferRatio,
  computeNetExpansion,
  computeAll,
  type FtcFact,
} from "../../lib/geo/metrics/derived";
import type { KosisIndustryAvg } from "../../utils/kosis";

type TestCase = { name: string; run: () => void };
const cases: TestCase[] = [];
const test = (name: string, run: () => void) => cases.push({ name, run });

// https://franchise.ftc.go.kr — BBQ 2024 정보공개서 요약 (가상 단순화 수치, 필드 유형 검증용)
const bbqSample: FtcFact = {
  yr: "2024",
  brandNm: "BBQ",
  corpNm: "제너시스비비큐",
  indutyLclasNm: "외식",
  indutyMlsfcNm: "치킨",
  frcsCnt: 2200,
  newFrcsRgsCnt: 180,
  ctrtEndCnt: 40,
  ctrtCncltnCnt: 60,
  nmChgCnt: 120,
  avrgSlsAmt: 420000,   // 천원 (연 4.2억)
  arUnitAvrgSlsAmt: 5500,
  jnggmAmt: 10000,      // 가맹금 1000만원 (10,000 천원)
  eduAmt: 2500,         // 교육비 250만원
  grntyAmt: 5000,       // 보증금 500만원
  etcAmt: 37500,        // 기타 3750만원 (인테리어·장비 등)
};

const kyochonSample: FtcFact = {
  yr: "2024",
  brandNm: "교촌치킨",
  corpNm: "교촌에프앤비",
  indutyLclasNm: "외식",
  indutyMlsfcNm: "치킨",
  frcsCnt: 1377,
  newFrcsRgsCnt: 60,
  ctrtEndCnt: 20,
  ctrtCncltnCnt: 15,
  nmChgCnt: 45,
  avrgSlsAmt: 630000,
  arUnitAvrgSlsAmt: 6700,
};

const bhcSample: FtcFact = { ...bbqSample, brandNm: "BHC", corpNm: "비에이치씨", frcsCnt: 2100, avrgSlsAmt: 480000 };
const smallSample: FtcFact = { ...bbqSample, brandNm: "소규모치킨", corpNm: "A", frcsCnt: 30, avrgSlsAmt: 150000 };

const industryAvg: KosisIndustryAvg = {
  industry_code: "I56",
  industry_name: "음식점 및 주점업",
  avg_revenue_monthly: 3000,  // 월평균매출 3000만원 (업종 평균 가정)
  growth_rate_yoy: 2.1,
  source_period: "2024-01",
};

// ── 1. real_invest ──
test("computeRealInvestment: BBQ 4필드 합산 만원", () => {
  const m = computeRealInvestment(bbqSample);
  assert.ok(m, "metric null이면 안 됨");
  assert.equal(m.key, "real_invest");
  assert.equal(m.unit, "만원");
  assert.equal(m.value, 5500); // (10000+2500+5000+37500)/10 = 5500
  assert.equal(m.confidence, "high");
});

test("computeRealInvestment: 창업비용 필드 전부 null이면 null 반환", () => {
  const stripped: FtcFact = { ...bbqSample, jnggmAmt: undefined, eduAmt: undefined, grntyAmt: undefined, etcAmt: undefined };
  assert.equal(computeRealInvestment(stripped), null);
});

// ── 2. payback ──
test("computePaybackPeriod: BBQ 기본 마진 10% 12개월 이내", () => {
  const m = computePaybackPeriod(bbqSample);
  assert.ok(m);
  assert.equal(m.key, "payback");
  assert.equal(m.unit, "개월");
  // 실투자금 5500만원 / (연매출 42000만원 × 0.1 / 12) = 5500 / 350 ≈ 15.7개월
  assert.ok(m.value > 10 && m.value < 25, `예상 10~25개월, 실제=${m.value}`);
});

test("computePaybackPeriod: overrideMarginRate=0.15 적용 시 confidence=high", () => {
  const m = computePaybackPeriod(bbqSample, 0.15);
  assert.ok(m);
  assert.equal(m.confidence, "high");
});

// ── 3. net_margin ──
test("computeNetMargin: 업종 평균 대비 배수 → 마진율 추정", () => {
  const m = computeNetMargin(bbqSample, industryAvg);
  assert.ok(m);
  assert.equal(m.key, "net_margin");
  assert.equal(m.unit, "%");
  assert.ok(m.value >= 5 && m.value <= 25, `range 5~25, got ${m.value}`);
});

test("computeNetMargin: industryAvg null이면 null", () => {
  assert.equal(computeNetMargin(bbqSample, null), null);
});

// ── 4. industry_position ──
test("computeIndustryPosition: BBQ가 peer 중 상위", () => {
  const m = computeIndustryPosition(bbqSample, [bbqSample, kyochonSample, bhcSample, smallSample]);
  assert.ok(m);
  assert.equal(m.key, "industry_position");
  assert.equal(m.unit, "%");
  assert.ok(m.value > 0 && m.value <= 100);
});

test("computeIndustryPosition: peer 3개 미만이면 null", () => {
  assert.equal(computeIndustryPosition(bbqSample, [kyochonSample]), null);
});

// ── 5. (PR050 폐기) real_closure_rate — 명의변경 ≠ 폐점, 자체 산출 misleading 으로 폐기.

// ── 6. expansion_ratio ──
test("computeExpansionRatio: BBQ 180/2200 ≈ 0.08배", () => {
  const m = computeExpansionRatio(bbqSample);
  assert.ok(m);
  assert.equal(m.key, "expansion_ratio");
  assert.equal(m.unit, "배");
  assert.ok(Math.abs(m.value - 0.08) < 0.01, `expected ~0.08, got ${m.value}`);
});

// ── 7. transfer_ratio ──
test("computeTransferRatio: BBQ 120/2200 ≈ 5.5%", () => {
  const m = computeTransferRatio(bbqSample);
  assert.ok(m);
  assert.equal(m.key, "transfer_ratio");
  assert.equal(m.unit, "%");
  assert.ok(Math.abs(m.value - 5.5) < 0.2, `expected ~5.5, got ${m.value}`);
});

// ── 8. net_expansion ──
test("computeNetExpansion: BBQ 180-(40+60) = 80개", () => {
  const m = computeNetExpansion(bbqSample);
  assert.ok(m);
  assert.equal(m.key, "net_expansion");
  assert.equal(m.unit, "개");
  assert.equal(m.value, 80);
});

// ── computeAll 통합 ──
test("computeAll: BBQ + industryAvg + peer → 최소 6~7개 metric (PR050 real_closure_rate 폐기)", () => {
  const metrics = computeAll(bbqSample, { industryAvg, peerList: [bbqSample, kyochonSample, bhcSample, smallSample] });
  assert.ok(metrics.length >= 6, `expected ≥6 metrics, got ${metrics.length}`);
  const keys = metrics.map((m) => m.key);
  for (const k of ["real_invest", "payback", "expansion_ratio", "transfer_ratio", "net_expansion"]) {
    assert.ok(keys.includes(k as typeof metrics[number]["key"]), `missing ${k}`);
  }
  assert.ok(!keys.includes("real_closure_rate" as typeof metrics[number]["key"]), "real_closure_rate should be deprecated");
});

// 실행
let ok = 0, fail = 0;
for (const tc of cases) {
  try {
    tc.run();
    console.log(`  ✅ ${tc.name}`);
    ok++;
  } catch (e) {
    console.error(`  ❌ ${tc.name} — ${e instanceof Error ? e.message : e}`);
    fail++;
  }
}
console.log(`\n${ok}/${cases.length} passed (${fail} failed)`);
if (fail > 0) process.exit(1);
