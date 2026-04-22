import * as fs from "fs";
import * as path from "path";
import type { Metadata } from "next";
import Script from "next/script";
import { createAdminClient } from "@/utils/supabase/admin";
import RankingTable from "@/components/ranking/RankingTable";
import InterpretationGuide from "@/components/ranking/InterpretationGuide";
import { buildItemListJsonLd, buildDatasetJsonLd } from "@/utils/ranking-jsonld";
import type { GeoInterestRankingCacheItem, GeoInterestRankingCachePayload } from "@/types/geo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const BASE_URL = "https://tnsgroupware.vercel.app";
const CANONICAL = `${BASE_URL}/franchise/ranking/interest`;

export const metadata: Metadata = {
  title: "2026년 4월 외식 프랜차이즈 관심도 TOP 50 — 네이버 검색광고 API 기준",
  description: "2026-04 월간 검색량 기준 외식 프랜차이즈 관심도 TOP 50. 네이버 검색광고 API · 공정위 정보공개서 교차 검증.",
  alternates: { canonical: CANONICAL },
  openGraph: {
    title: "2026년 4월 외식 프랜차이즈 관심도 TOP 50",
    description: "월간 검색량 기준 브랜드 랭킹 · 창업 가능 뱃지 표기",
    url: CANONICAL,
    type: "website",
    siteName: "프랜도어",
  },
  robots: { index: true, follow: true },
};

type FallbackBrand = {
  brand: string;
  category: string;
  pc: number;
  mobile: number;
  total: number;
  compIdx: string;
  usedAlias: string;
};

type FallbackFile = {
  dataAsOf: string;
  source: string;
  method: string;
  all: FallbackBrand[];
};

async function loadFromCache(ym: string): Promise<GeoInterestRankingCachePayload | null> {
  try {
    const supa = createAdminClient();
    const { data } = await supa
      .from("geo_interest_ranking_cache")
      .select("payload")
      .eq("year_month", ym)
      .is("category", null)
      .maybeSingle();
    const p = (data as { payload?: GeoInterestRankingCachePayload } | null)?.payload;
    return p ?? null;
  } catch {
    return null;
  }
}

function loadFallback(): GeoInterestRankingCachePayload | null {
  try {
    const file = path.resolve(process.cwd(), "docs", "geo", "top50_search_volume_v2.json");
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as FallbackFile;
    const ym = raw.dataAsOf.slice(0, 7);
    const sorted = [...raw.all].sort((a, b) => b.total - a.total).slice(0, 50);
    const items: GeoInterestRankingCacheItem[] = sorted.map((b, i) => ({
      rank: i + 1,
      brand: b.brand,
      category: b.category,
      total_volume: b.total,
      pc_volume: b.pc,
      mobile_volume: b.mobile,
      comp_index: b.compIdx,
      used_alias: b.usedAlias,
      measurement_floor: false,
    }));
    return {
      year_month: ym,
      generated_at: new Date().toISOString(),
      source: raw.source,
      method: raw.method,
      items,
      meta: {
        total_brands: sorted.length,
        include_count: items.length,
        conditional_count: 0,
        exclude_count: 0,
      },
    };
  } catch {
    return null;
  }
}

export default async function InterestRankingPage() {
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const cache = (await loadFromCache(ym)) ?? loadFallback();

  if (!cache || cache.items.length === 0) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <h1 className="text-xl font-bold text-slate-800">외식 프랜차이즈 관심도 랭킹</h1>
        <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
          데이터 준비 중입니다. 네이버 검색광고 API 수집 완료 후 표시됩니다.
        </p>
      </main>
    );
  }

  const items = cache.items;
  const top3 = items.slice(0, 3);
  const itemListLd = buildItemListJsonLd(items, cache.year_month, BASE_URL);
  const datasetLd = buildDatasetJsonLd({
    yearMonth: cache.year_month,
    url: CANONICAL,
    generatedAt: cache.generated_at,
    source: cache.source,
    method: cache.method,
  });

  return (
    <main className="mx-auto max-w-4xl space-y-8 p-6">
      <header className="space-y-3">
        <h1 className="text-2xl font-bold text-slate-800">
          {cache.year_month.replace("-", "년 ")}월 외식 프랜차이즈 관심도 TOP {items.length}
        </h1>
        <p className="text-sm text-slate-600">
          {cache.year_month} 기준 네이버 검색광고 API 월간 검색량으로 집계한 외식 프랜차이즈 관심도 순위.
          1위 {top3[0]?.brand}({top3[0]?.total_volume.toLocaleString("ko-KR")}) · 2위 {top3[1]?.brand}({top3[1]?.total_volume.toLocaleString("ko-KR")}) · 3위 {top3[2]?.brand}({top3[2]?.total_volume.toLocaleString("ko-KR")}).
          출처: {cache.source}.
        </p>
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-600 md:flex md:gap-6">
          <div><span className="text-slate-400">기준월</span> {cache.year_month}</div>
          <div><span className="text-slate-400">출처</span> {cache.source}</div>
          <div><span className="text-slate-400">갱신 주기</span> 월 1회</div>
          <div><span className="text-slate-400">집계</span> {cache.method}</div>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-3">
        {top3.map((t) => (
          <div key={t.brand} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-xs text-slate-500">#{t.rank} · {t.category}</div>
            <div className="mt-1 text-lg font-semibold text-slate-800">{t.brand}</div>
            <div className="mt-1 text-sm tabular-nums text-slate-600">
              {t.total_volume.toLocaleString("ko-KR")} <span className="text-xs text-slate-400">회/월</span>
            </div>
          </div>
        ))}
      </section>

      <section>
        <InterpretationGuide />
      </section>

      <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4">
        <RankingTable items={items} yearMonth={cache.year_month} />
      </section>

      <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        <h2 className="text-sm font-semibold text-slate-800">시장 시그널 재해석</h2>
        <p className="mt-2">
          검색량 상위 업종은 소비자 관심이 크지만 창업 매력도와 직결되지 않습니다.
          직영 운영 브랜드(❌)는 가맹 모집 없음, 조건부(⚠️)는 벤치마크 참고만 권장.
          실제 창업 의사결정은 공정위 정보공개서의 폐점률·평균매출과 함께 판단하세요.
        </p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-800">자주 묻는 질문</h2>
        <dl className="mt-3 space-y-3 text-sm text-slate-700">
          <div>
            <dt className="font-medium">검색량은 어떻게 집계하나요?</dt>
            <dd className="mt-1 text-slate-600">
              네이버 검색광고 API keywordstool 엔드포인트로 {cache.year_month} 월간 PC·모바일 검색량을 수집한 뒤 브랜드별 alias 중 최대값을 채택합니다 ({cache.method}).
            </dd>
          </div>
          <div>
            <dt className="font-medium">창업 가능한 브랜드는 몇 개인가요?</dt>
            <dd className="mt-1 text-slate-600">
              TOP {items.length} 중 가맹 모집 브랜드는 {items.filter(i => i.matrix_rule !== "EXCLUDE").length}개입니다. 공정거래위원회 정보공개서 기준.
            </dd>
          </div>
          <div>
            <dt className="font-medium">갱신 주기는 어떻게 되나요?</dt>
            <dd className="mt-1 text-slate-600">매월 1일 자동 갱신됩니다. dateModified: {cache.generated_at.slice(0, 10)}.</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-500">
        <h2 className="text-sm font-semibold text-slate-800">출처·집계 방식</h2>
        <ul className="mt-2 space-y-1">
          <li>- 데이터: {cache.source}</li>
          <li>- 방법: {cache.method}</li>
          <li>- 교차검증: 공정거래위원회 정보공개서 (https://franchise.ftc.go.kr)</li>
          <li>- 갱신: 월 1회 (매월 1일 KST 12시 자동 수집)</li>
          <li>- 데이터 한계: &quot;&lt; 10&quot; 값은 5로 치환, alias 표기 차이 보정을 위해 alias-max 채택.</li>
        </ul>
      </section>

      <Script id="itemlist-jsonld" type="application/ld+json" strategy="beforeInteractive">
        {JSON.stringify(itemListLd)}
      </Script>
      <Script id="dataset-jsonld" type="application/ld+json" strategy="beforeInteractive">
        {JSON.stringify(datasetLd)}
      </Script>
    </main>
  );
}
