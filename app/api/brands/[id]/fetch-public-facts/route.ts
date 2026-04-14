/**
 * Public Fact 수집 라우트.
 *
 * 우선순위:
 *   1. 공공데이터포털 DATAPORTAL 브랜드별 가맹점 현황 API (11,167 브랜드 커버)
 *      → frcsCnt, avrgSlsAmt, newFrcsRgsCnt, ctrtCncltnCnt
 *   2. 공정위 FRANCHISE 정보공개서 본문 파싱 (~800 대형 브랜드 커버)
 *      → 가맹비/보증금/인테리어/창업비용 총액, 상세 매출 (상/하한)
 *   3. (부족분) OpenAI web_search_preview 로 화이트리스트 도메인 검색
 *
 * 모든 팩트는 provenance="public_fetch" 로 저장되고, source_type 은:
 *   - "공정위" (FRANCHISE/DATAPORTAL API)
 *   - "언론_보도" / "정부_통계" 등 (web_search 경유)
 */

import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";
import { createAdminClient } from "@/utils/supabase/admin";
import OpenAI from "openai";
import {
  PUBLIC_FACT_EXTRACTION_SCHEMA,
  FACT_LABEL_ENUM,
  type FactRecord,
  type FactLabel,
  type FactUnit,
  type FactSourceType,
} from "@/types/factSchema";
import { PUBLIC_SOURCE_WHITELIST, isWhitelistedUrl } from "@/utils/publicSourceWhitelist";
import { findBrandFrcsStat } from "@/utils/ftcDataPortal";
import { findJngIfrmpSn, ftcContent } from "@/utils/ftcFranchise";
import { extractFactsFromContent, type ExtractedFact } from "@/utils/ftcContentParser";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type RawPublicFact = {
  label: FactLabel;
  value: string;
  value_normalized: number | null;
  unit: FactUnit;
  source_type: FactSourceType;
  source_url: string;
  source_note: string | null;
  confidence: number;
};

// FTC 콘텐츠 파서 라벨 → FACT_LABEL_ENUM 매핑
const CONTENT_LABEL_MAP: Partial<Record<ExtractedFact["label"], FactLabel>> = {
  "가맹점수_전체": "가맹점수_전체",
  "연평균매출액_전체": "연평균매출",
  "신규개점_직전연도": "신규개점수",
  "계약해지_직전연도": "계약해지수",
  "가맹비": "가맹비",
  "보증금": "보증금",
  "기타비용_총계": "기타창업비용",
  "인테리어비": "인테리어비",
  "창업비용_총액": "창업비용총액",
};

function buildFtcViewerUrl(jngIfrmpSn: string): string {
  return `https://franchise.ftc.go.kr/mnu/00013/program/userRqst/view.do?jngIfrmpSn=${jngIfrmpSn}`;
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const { id: brandId } = await context.params;
  const supabase = createAdminClient();

  const { data: brand } = await supabase
    .from("geo_brands")
    .select("name")
    .eq("id", brandId)
    .single();
  if (!brand) return NextResponse.json({ error: "브랜드 없음" }, { status: 404 });

  // docx 에서 법인명/등록번호 추출 (매칭률 향상)
  const { data: doc } = await supabase
    .from("brand_source_doc")
    .select("markdown_text")
    .eq("brand_id", brandId)
    .maybeSingle();
  const docxText = doc?.markdown_text ?? "";

  const extractField = (patterns: RegExp[]): string | null => {
    for (const re of patterns) {
      const m = docxText.match(re);
      if (m?.[1]) {
        const v = m[1].trim().replace(/\s+/g, " ");
        if (v.length > 0 && v.length < 80) return v;
      }
    }
    return null;
  };

  const corporateName = extractField([
    /(?:가맹본부(?:명|\s*상호)?|본사\s*명|법인\s*명|상호(?:\s*명)?|회사\s*명|사업자\s*명)\s*[:：\|]\s*([^\n\r\|]+?)(?=[\n\r\|]|$)/,
    /(?:\(주\)|㈜|주식회사)\s*([가-힣A-Za-z0-9]{2,30})/,
  ]);
  const registrationNo = extractField([
    /(?:가맹사업\s*)?등록번호\s*[:：\|]\s*([0-9\-]{6,})/,
  ]);

  const collected: RawPublicFact[] = [];
  const usedSources: string[] = [];

  // ── Step 1: DATAPORTAL 브랜드 가맹점 현황 ──
  try {
    const stat = await findBrandFrcsStat({
      brandName: brand.name,
      corpName: corporateName ?? undefined,
    });
    if (stat) {
      const note = `공정위 ${stat.yr} 브랜드별 가맹점 현황 | ${stat.corpNm}/${stat.brandNm}`;
      const srcUrl = "https://www.data.go.kr/data/15125570/openapi.do";
      usedSources.push(`DATAPORTAL(${stat.yr})`);
      if (stat.frcsCnt > 0) {
        collected.push({
          label: "가맹점수_전체",
          value: `${stat.frcsCnt}개`,
          value_normalized: stat.frcsCnt,
          unit: "개",
          source_type: "공정위",
          source_url: srcUrl,
          source_note: note,
          confidence: 0.95,
        });
      }
      if (stat.avrgSlsAmt > 0) {
        // 천원 → 만원 환산
        const manwon = Math.round(stat.avrgSlsAmt / 10);
        collected.push({
          label: "연평균매출",
          value: `${manwon.toLocaleString()}만원`,
          value_normalized: manwon,
          unit: "만원",
          source_type: "공정위",
          source_url: srcUrl,
          source_note: note,
          confidence: 0.95,
        });
      }
      if (stat.newFrcsRgsCnt > 0) {
        collected.push({
          label: "신규개점수",
          value: `${stat.newFrcsRgsCnt}개`,
          value_normalized: stat.newFrcsRgsCnt,
          unit: "개",
          source_type: "공정위",
          source_url: srcUrl,
          source_note: note,
          confidence: 0.95,
        });
      }
      if (stat.ctrtCncltnCnt > 0) {
        collected.push({
          label: "계약해지수",
          value: `${stat.ctrtCncltnCnt}개`,
          value_normalized: stat.ctrtCncltnCnt,
          unit: "개",
          source_type: "공정위",
          source_url: srcUrl,
          source_note: note,
          confidence: 0.95,
        });
      }
    }
  } catch (e) {
    console.error("[fetch-public-facts] DATAPORTAL 실패:", e);
  }

  // ── Step 2: FRANCHISE 정보공개서 본문 파싱 ──
  try {
    const listItem = await findJngIfrmpSn({
      brandName: brand.name,
      corpName: corporateName ?? undefined,
      brno: registrationNo ?? undefined,
    });
    if (listItem?.jngIfrmpSn) {
      const { sections } = await ftcContent(listItem.jngIfrmpSn);
      const extracted = extractFactsFromContent(sections);
      const viewerUrl = buildFtcViewerUrl(listItem.jngIfrmpSn);
      usedSources.push(`FRANCHISE(jngIfrmpSn=${listItem.jngIfrmpSn})`);
      for (const f of extracted) {
        const mappedLabel = CONTENT_LABEL_MAP[f.label];
        if (!mappedLabel) continue;
        // 천원 → 만원 환산 (매출·비용 계열)
        if (f.unit === "천원") {
          const manwon = Math.round(f.value / 10);
          collected.push({
            label: mappedLabel,
            value: `${manwon.toLocaleString()}만원`,
            value_normalized: manwon,
            unit: "만원",
            source_type: "공정위",
            source_url: viewerUrl,
            source_note: `정보공개서 ${f.sectionCode}${f.yearLabel ? ` (${f.yearLabel})` : ""} | ${listItem.corpNm}/${listItem.brandNm}`,
            confidence: 0.92,
          });
        } else {
          collected.push({
            label: mappedLabel,
            value: `${f.value}${f.unit}`,
            value_normalized: f.value,
            unit: f.unit,
            source_type: "공정위",
            source_url: viewerUrl,
            source_note: `정보공개서 ${f.sectionCode}${f.yearLabel ? ` (${f.yearLabel})` : ""} | ${listItem.corpNm}/${listItem.brandNm}`,
            confidence: 0.92,
          });
        }
      }
    }
  } catch (e) {
    console.error("[fetch-public-facts] FRANCHISE content 실패:", e);
  }

  // ── Step 3: 부족 라벨을 web_search 로 보강 ──
  const coveredLabels = new Set(collected.map(f => f.label));
  const missingLabels = FACT_LABEL_ENUM.filter(l => !coveredLabels.has(l));

  // web_search 는 돈/시간 비싸므로 핵심 라벨 빠진 경우에만 호출
  const CORE = ["연평균매출", "가맹점수_전체", "창업비용총액", "영업이익률", "폐점률"] as const;
  const needsWebSearch = CORE.some(l => !coveredLabels.has(l as FactLabel));

  const citationUrls: string[] = [];
  if (needsWebSearch) {
    const DOMAIN_LIST = PUBLIC_SOURCE_WHITELIST.join(", ");
    const SEARCH_INSTRUCTIONS = `당신은 프랜차이즈 팩트 수집 전문가다. 공신력 있는 공개 자료에서만 수치를 가져온다.

반드시 아래 도메인만 참고하라 (다른 도메인 인용 시 결과 무시됨):
${DOMAIN_LIST}

각 수치마다 출처 URL 을 명시하라. 출처 불명확한 수치는 반환하지 마라.`;

    const EXTRACTION_SYSTEM = `아래 웹검색 결과에서 프랜차이즈 팩트를 Structured Outputs 로 추출하라.

규칙:
1. label 은 enum 값만. 다른 이름 금지.
2. 원문에 없는 수치 금지. 추측·보간 금지.
3. source_url 은 검색 결과에 실제로 등장한 URL 이어야 한다.
4. source_type 판별:
   - franchise.ftc.go.kr / ftc.go.kr → "공정위"
   - kosis.kr / kostat.go.kr / data.go.kr → "정부_통계"
   - 언론 도메인 → "언론_보도"
   - haccp.or.kr → "공식_인증"
5. source_note 에 수치의 기준(연도·표본·범위) 을 보존하라.
6. value 는 원문 표기 그대로, value_normalized 는 기준 단위 숫자.`;

    const brandIdentifiers = [
      `브랜드명: "${brand.name}"`,
      corporateName ? `가맹본부 법인명: "${corporateName}"` : null,
      registrationNo ? `공정위 등록번호: ${registrationNo}` : null,
    ].filter(Boolean).join("\n");

    const searchInput = `다음 프랜차이즈의 보조 공개 수치를 수집하라 (FTC API 에서 이미 확보된 수치는 제외).

${brandIdentifiers}

이미 확보한 라벨: ${[...coveredLabels].join(", ") || "(없음)"}
추가 필요 라벨: ${missingLabels.join(", ")}

경제지·창업 전문 매체(sedaily.com, mk.co.kr, hankyung.com, foodbank.co.kr 등) 에서 브랜드명으로 인용된 수치를 찾아라.
각 항목마다 출처 URL, 기준 연도/시점, 표본 범위를 명시하라. 찾지 못한 항목은 생략.`;

    let searchOutput = "";
    try {
      const result = await openai.responses.create({
        model: "gpt-5.4",
        tools: [{ type: "web_search_preview" as const }],
        instructions: SEARCH_INSTRUCTIONS,
        input: searchInput,
      });
      for (const o of result.output ?? []) {
        if (o.type === "message" && "content" in o) {
          type ContentItem = {
            type: string;
            text?: string;
            annotations?: { type: string; url?: string }[];
          };
          for (const c of (o as unknown as { content: ContentItem[] }).content) {
            if (c.type === "output_text" && c.text) searchOutput += c.text + "\n";
            for (const ann of c.annotations ?? []) {
              if (ann.type === "url_citation" && ann.url) citationUrls.push(ann.url);
            }
          }
        }
      }
    } catch (e) {
      console.error("[fetch-public-facts] 웹검색 실패:", e);
    }

    if (searchOutput.trim()) {
      try {
        const extract = await openai.chat.completions.create({
          model: "gpt-5.4",
          response_format: { type: "json_schema", json_schema: PUBLIC_FACT_EXTRACTION_SCHEMA },
          messages: [
            { role: "system", content: EXTRACTION_SYSTEM },
            {
              role: "user",
              content: `브랜드: ${brand.name}\n\n[WEB_SEARCH_OUTPUT]\n${searchOutput.slice(0, 30_000)}\n\n[CITATION_URLS]\n${citationUrls.join("\n")}`,
            },
          ],
        });
        const parsed = JSON.parse(extract.choices[0]?.message?.content ?? "{}") as { facts?: RawPublicFact[] };
        for (const f of parsed.facts ?? []) {
          if (f.confidence < 0.6) continue;
          if (!isWhitelistedUrl(f.source_url)) continue;
          if (coveredLabels.has(f.label)) continue; // FTC API 값 보존
          collected.push(f);
        }
        usedSources.push(`web_search(${citationUrls.length}건)`);
      } catch (e) {
        console.error("[fetch-public-facts] 정제 실패:", e);
      }
    }
  }

  // ── 기존 public_fetch 삭제 → 신규 삽입 ──
  await supabase.from("brand_fact_data").delete()
    .eq("brand_id", brandId)
    .eq("provenance", "public_fetch");

  let insertedCount = 0;
  if (collected.length > 0) {
    const rows: Omit<FactRecord, "id" | "created_at">[] = collected.map(f => ({
      brand_id: brandId,
      label: f.label,
      value: f.value,
      value_normalized: f.value_normalized,
      unit: f.unit,
      source_type: f.source_type,
      source_note: f.source_note,
      source_url: f.source_url,
      provenance: "public_fetch",
      confidence: f.confidence,
      fetched_at: new Date().toISOString(),
    }));
    const { error: insertErr } = await supabase.from("brand_fact_data").insert(rows);
    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });
    insertedCount = rows.length;
  }

  return NextResponse.json({
    ok: true,
    facts_count: insertedCount,
    sources_used: usedSources,
    matched_identifiers: {
      brand_name: brand.name,
      corporate_name: corporateName,
      registration_no: registrationNo,
    },
    citation_urls: citationUrls.filter(isWhitelistedUrl),
    facts: collected.slice(0, 20),
  });
}
