import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/utils/supabase/admin";
import DepthRenderer from "@/components/geo/DepthRenderer";
import type { GeoPayload, GeoPayloadFranchise } from "@/lib/geo/types";
import {
  buildBreadcrumb,
  buildFaqPage,
  buildFoodEstablishment,
  defaultBreadcrumbs,
} from "@/lib/geo/render/jsonLd";

const SITE_ORIGIN = "https://frandoor.co.kr";
const RESERVED_SLUGS = new Set(["ranking"]);

type CanonicalRow = {
  payload: GeoPayload | null;
  json_ld: Record<string, unknown>[] | null;
};

type BrandRow = {
  id: string;
  name: string;
  slug: string | null;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const canonical = `${SITE_ORIGIN}/franchise/${slug}`;
  const brandName = await resolveBrandName(slug);
  const label = brandName ?? slug;
  return {
    title: `${label} 프랜차이즈 — 창업비용·폐점률·평균매출 분석`,
    description: `${label} 프랜차이즈 공정위 정보공개서 기준 실질 데이터와 업종 비교.`,
    alternates: { canonical },
    openGraph: {
      title: `${label} 프랜차이즈 분석`,
      description: `${label} 창업비용·폐점률·평균매출 데이터`,
      url: canonical,
      type: "website",
      siteName: "프랜도어",
    },
    robots: { index: true, follow: true },
  };
}

async function resolveBrandName(slug: string): Promise<string | null> {
  try {
    const supa = createAdminClient();
    const { data } = await supa
      .from("geo_brands")
      .select("id, name, slug")
      .eq("slug", slug)
      .maybeSingle();
    const row = data as BrandRow | null;
    return row?.name ?? null;
  } catch {
    return null;
  }
}

async function loadFranchisePayload(slug: string): Promise<{
  brand: BrandRow | null;
  canonical: CanonicalRow | null;
}> {
  try {
    const supa = createAdminClient();
    const brandRes = await supa
      .from("geo_brands")
      .select("id, name, slug")
      .eq("slug", slug)
      .maybeSingle();
    const brand = (brandRes.data as BrandRow | null) ?? null;

    const { data } = await supa
      .from("geo_canonical")
      .select("payload, json_ld")
      .eq("canonical_url", `/franchise/${slug}`)
      .eq("depth", "D3")
      .maybeSingle();
    const canonical = (data as CanonicalRow | null) ?? null;
    return { brand, canonical };
  } catch {
    return { brand: null, canonical: null };
  }
}

export default async function FranchisePage(
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  if (RESERVED_SLUGS.has(slug)) notFound();

  const canonicalPath = `/franchise/${slug}`;
  const canonicalUrl = `${SITE_ORIGIN}${canonicalPath}`;
  const { brand, canonical } = await loadFranchisePayload(slug);
  const payload = canonical?.payload ?? null;
  const label = brand?.name ?? slug;

  if (!payload || payload.kind !== "franchiseDoc") {
    return (
      <main className="mx-auto max-w-3xl space-y-6 p-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-bold text-slate-800">
            {label} 프랜차이즈 분석
          </h1>
          <p className="text-sm text-slate-500">{canonicalPath}</p>
        </header>
        <section className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
          준비 중입니다. {label} 브랜드 D3 콘텐츠 생성 완료 후 표시됩니다.
        </section>
      </main>
    );
  }

  const franchisePayload: GeoPayloadFranchise = payload;
  const jsonLd = canonical?.json_ld ?? [
    buildFaqPage(franchisePayload.faq25 ?? []),
    buildBreadcrumb(defaultBreadcrumbs("D3", canonicalPath, label)),
    buildFoodEstablishment({ brand: label, canonicalUrl: canonicalPath }),
  ];

  return (
    <main>
      <header className="mx-auto max-w-3xl space-y-2 p-6 pb-0">
        <h1 className="text-2xl font-bold text-slate-800">
          {label} 프랜차이즈 분석
        </h1>
        <p className="text-sm text-slate-500">{canonicalPath}</p>
      </header>
      <DepthRenderer
        payload={franchisePayload}
        canonicalUrl={canonicalUrl}
        jsonLd={jsonLd}
      />
    </main>
  );
}
