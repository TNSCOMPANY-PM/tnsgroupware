"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import BrandBlogGenerator from "@/components/content/BrandBlogGenerator";

function Inner() {
  const sp = useSearchParams();
  const brandId = sp.get("brand_id") ?? undefined;
  return <BrandBlogGenerator brandId={brandId} />;
}

export default function BrandContentPage() {
  return (
    <Suspense fallback={<div className="text-sm text-slate-400">로딩…</div>}>
      <Inner />
    </Suspense>
  );
}
