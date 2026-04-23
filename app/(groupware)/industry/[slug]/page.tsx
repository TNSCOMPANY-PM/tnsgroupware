import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/utils/supabase/admin";
import DepthRenderer from "@/components/geo/DepthRenderer";
import { INDUSTRIES, getIndustryBySlug } from "@/constants/industries";
import type { GeoPayload, GeoPayloadIndustry } from "@/lib/geo/types";
import {
  buildBreadcrumb,
  buildFaqPage,
  defaultBreadcrumbs,
} from "@/lib/geo/render/jsonLd";

const SITE_ORIGIN = "https://frandoor.co.kr";

type CanonicalRow = {
  payload: GeoPayload | null;
  json_ld: Record<string, unknown>[] | null;
};

export function generateStaticParams(): Array<{ slug: string }> {
  return INDUSTRIES.map((i) => ({ slug: i.slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const industry = getIndustryBySlug(slug);
  const name = industry?.name ?? slug;
  const canonical = `${SITE_ORIGIN}/industry/${slug}`;
  return {
    title: `${name} 프랜차이즈 업종 분석 — 프랜도어`,
    description: `${name} 프랜차이즈 업종 시장 데이터·경쟁 비교·개폐점 트렌드 정리.`,
    alternates: { canonical },
    openGraph: {
      title: `${name} 프랜차이즈 업종 분석`,
      description: `${name} 업종 시장 데이터와 주요 브랜드 비교`,
      url: canonical,
      type: "website",
      siteName: "프랜도어",
    },
    robots: { index: true, follow: true },
  };
}

async function loadIndustryPayload(slug: string): Promise<CanonicalRow | null> {
  try {
    const supa = createAdminClient();
    const { data } = await supa
      .from("geo_canonical")
      .select("payload, json_ld")
      .eq("canonical_url", `/industry/${slug}`)
      .eq("depth", "D2")
      .maybeSingle();
    const row = data as CanonicalRow | null;
    return row ?? null;
  } catch {
    return null;
  }
}

export default async function IndustryPage(
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const industry = getIndustryBySlug(slug);
  if (!industry) notFound();

  const canonicalPath = `/industry/${slug}`;
  const canonicalUrl = `${SITE_ORIGIN}${canonicalPath}`;
  const row = await loadIndustryPayload(slug);
  const payload = row?.payload ?? null;

  if (!payload || payload.kind !== "industryDoc") {
    return (
      <main className="mx-auto max-w-3xl space-y-6 p-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-bold text-slate-800">
            {industry.name} 프랜차이즈 업종 분석
          </h1>
          <p className="text-sm text-slate-500">{canonicalPath}</p>
        </header>
        <section className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
          준비 중입니다. {industry.name} 업종 데이터 수집·생성 완료 후 표시됩니다.
        </section>
      </main>
    );
  }

  const industryPayload: GeoPayloadIndustry = payload;
  const jsonLd = row?.json_ld ?? [
    buildBreadcrumb(defaultBreadcrumbs("D2", canonicalPath, industry.name)),
    buildFaqPage([]),
  ];

  return (
    <main>
      <header className="mx-auto max-w-3xl space-y-2 p-6 pb-0">
        <h1 className="text-2xl font-bold text-slate-800">
          {industry.name} 프랜차이즈 업종 분석
        </h1>
        <p className="text-sm text-slate-500">{canonicalPath}</p>
      </header>
      <DepthRenderer
        payload={industryPayload}
        canonicalUrl={canonicalUrl}
        jsonLd={jsonLd}
      />
    </main>
  );
}
