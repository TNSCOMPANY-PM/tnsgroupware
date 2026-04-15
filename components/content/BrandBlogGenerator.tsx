"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Sparkles, FileText, Copy, Download, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OG_WRAP_CSS as OG_WRAP_CSS_INLINE } from "@/constants/blogCssTemplate";

type Brand = {
  id: string;
  name: string;
  landing_url?: string;
  fact_data?: { keyword: string; label: string }[];
};

type BlogResultType = {
  title?: string;
  meta_description?: string;
  keywords?: string[];
  content?: string;
  faq?: { q: string; a: string }[];
  schema_markup?: string;
  seo_score_tips?: string[];
  sources_cited?: string[];
  character_count?: number;
  error?: string;
};

type PreviewTab = "frandoor" | "tistory" | "naver" | "medium";

export default function BrandBlogGenerator({ brandId: initialBrandId }: { brandId?: string }) {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandId, setBrandId] = useState<string>(initialBrandId ?? "");
  const [blogPlatform, setBlogPlatform] = useState<PreviewTab>("frandoor");
  const [blogTopic, setBlogTopic] = useState("");
  const [blogProvider, setBlogProvider] = useState<"openai" | "gemini" | "claude">("claude");
  const [blogReaderStage, setBlogReaderStage] = useState<"awareness" | "consideration" | "decision">("decision");
  const [blogSearchIntent, setBlogSearchIntent] = useState<"informational" | "navigational" | "transactional">("transactional");
  const [blogGenerating, setBlogGenerating] = useState(false);
  const [blogResult, setBlogResult] = useState<BlogResultType | null>(null);
  const [blogAllResults, setBlogAllResults] = useState<Record<string, BlogResultType>>({});
  const [blogConverting, setBlogConverting] = useState<string | null>(null);
  const [blogConvertedResults, setBlogConvertedResults] = useState<Record<string, string>>({});
  const [blogViewMode, setBlogViewMode] = useState<"preview" | "html">("preview");
  const [blogRefLinks, setBlogRefLinks] = useState<string[]>(["", "", "", "", ""]);

  const selectedBrand = useMemo(() => brands.find(b => b.id === brandId) ?? null, [brands, brandId]);

  useEffect(() => {
    let ignore = false;
    fetch("/api/geo/brands").then(r => r.ok ? r.json() : []).then(data => {
      if (ignore) return;
      setBrands(data ?? []);
    });
    return () => { ignore = true; };
  }, []);

  useEffect(() => {
    if (!selectedBrand) return;
    const entry = (selectedBrand.fact_data ?? []).find(d => d.label === "__blog_ref_links__");
    if (entry) {
      try {
        const parsed = JSON.parse(entry.keyword) as string[];
        const padded = [...parsed, "", "", "", "", ""].slice(0, 5);
        setBlogRefLinks(padded);
      } catch { /* ignore */ }
    } else {
      setBlogRefLinks(["", "", "", "", ""]);
    }
  }, [selectedBrand]);

  const tabs: { key: PreviewTab; label: string; color: string }[] = [
    { key: "frandoor", label: "원본", color: "blue" },
    { key: "tistory", label: "티스토리", color: "orange" },
    { key: "naver", label: "네이버", color: "green" },
    { key: "medium", label: "Medium", color: "slate" },
  ];

  const triggerConvert = async (target: PreviewTab) => {
    if (!selectedBrand || !blogResult) return;
    if (target === "frandoor" || blogConvertedResults[target] || blogConverting) return;
    setBlogConverting(target);
    try {
      if (target === "medium") {
        const res = await fetch("/api/geo/blog-convert", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: blogResult.content, title: blogResult.title ?? "",
            target, faq: blogResult.faq, keywords: blogResult.keywords,
            meta_description: blogResult.meta_description, schema_markup: blogResult.schema_markup,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          setBlogConvertedResults(prev => ({ ...prev, [target]: data.converted_content }));
        }
      } else {
        const otherTitles = Object.entries(blogAllResults)
          .filter(([ch, v]) => ch !== target && v?.title)
          .map(([, v]) => v.title as string);
        if (blogResult.title) otherTitles.unshift(blogResult.title);
        const res = await fetch("/api/geo/blog-generate", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            brand_id: selectedBrand.id,
            platform: target,
            topic: blogTopic,
            provider: blogProvider,
            ref_links: blogRefLinks.filter(l => l.trim()),
            reader_stage: blogReaderStage,
            search_intent: blogSearchIntent,
            other_channels_titles: otherTitles,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          setBlogConvertedResults(prev => ({ ...prev, [target]: data.content ?? "" }));
          setBlogAllResults(prev => ({ ...prev, [target]: data }));
        }
      }
    } catch { /* ignore */ }
    setBlogConverting(null);
  };

  const saveRefLinks = async () => {
    if (!selectedBrand) return;
    const links = blogRefLinks.filter(l => l.trim());
    const currentFactData = (selectedBrand.fact_data && Array.isArray(selectedBrand.fact_data))
      ? selectedBrand.fact_data.filter(d => d.label !== "__blog_ref_links__")
      : [];
    const newFactData = [...currentFactData, { keyword: JSON.stringify(links), label: "__blog_ref_links__" }];
    await fetch("/api/geo/brands", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: selectedBrand.id, fact_data: newFactData }),
    });
    setBrands(prev => prev.map(b => b.id === selectedBrand.id ? { ...b, fact_data: newFactData } : b));
    alert(`${links.length}개 링크 저장됨`);
  };

  const generate = async () => {
    if (!blogTopic.trim() || !selectedBrand || blogGenerating) return;
    setBlogGenerating(true);
    setBlogResult(null);
    setBlogConvertedResults({});
    setBlogAllResults({});
    const refLinks = blogRefLinks.filter(l => l.trim());
    try {
      const res = await fetch("/api/geo/blog-generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand_id: selectedBrand.id, platform: "frandoor", topic: blogTopic,
          provider: blogProvider, ref_links: refLinks,
          reader_stage: blogReaderStage, search_intent: blogSearchIntent,
        }),
      });
      const data = await res.json();
      if (!res.ok) setBlogResult({ error: data.error || `생성 실패 (${res.status})` });
      else setBlogResult(data);
    } catch {
      setBlogResult({ error: "생성 실패. 다시 시도해주세요." });
    }
    setBlogGenerating(false);
  };

  const savePost = async (channel: string, content: string, meta: BlogResultType) => {
    if (!selectedBrand) return false;
    const today = new Date().toISOString().slice(0, 10);
    const res = await fetch("/api/geo/blog-drafts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brand_id: selectedBrand.id, channel,
        title: meta.title ?? "", content,
        meta_description: meta.meta_description ?? "",
        keywords: meta.keywords ?? [], faq: meta.faq ?? [],
        schema_markup: meta.schema_markup ?? "",
        target_date: today,
      }),
    });
    return res.ok;
  };

  const activePreview = blogPlatform;
  const convertedContent = blogConvertedResults[activePreview] ?? null;
  const isOriginal = activePreview === "frandoor";
  const hasConverted = !isOriginal && !!convertedContent;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* 좌측: 결과 */}
      <div className="lg:col-span-2 space-y-4">
        {blogResult ? (
          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700">
                생성 결과 {blogResult.character_count ? `(${blogResult.character_count}자)` : ""}
              </h2>
              <div className="flex gap-2">
                <button onClick={async () => {
                  const ok = await savePost("frandoor", blogResult.content ?? "", blogResult);
                  alert(ok ? "저장 완료" : "저장 실패");
                }} className="text-xs text-emerald-600 hover:text-emerald-800 flex items-center gap-1">
                  <Download className="h-3 w-3" />저장하기
                </button>
                <button onClick={() => { navigator.clipboard.writeText(blogResult.content ?? ""); alert("본문 복사됨"); }}
                  className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1">
                  <Copy className="h-3 w-3" />본문 복사
                </button>
                {blogResult.schema_markup && (
                  <button onClick={() => { navigator.clipboard.writeText(blogResult.schema_markup ?? ""); alert("스키마 복사됨"); }}
                    className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1">
                    <Copy className="h-3 w-3" />스키마 복사
                  </button>
                )}
              </div>
            </div>

            {blogResult.title && (
              <div className="bg-slate-50 rounded-lg p-4">
                <p className="text-xs text-slate-400 mb-1">제목</p>
                <p className="text-base font-bold text-slate-800">{blogResult.title}</p>
                {blogResult.meta_description && <p className="text-xs text-slate-500 mt-2">{blogResult.meta_description}</p>}
                {blogResult.keywords && blogResult.keywords.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {blogResult.keywords.map((kw, i) => <span key={i} className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded">{kw}</span>)}
                  </div>
                )}
              </div>
            )}

            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <div className="flex items-center bg-slate-50 border-b border-slate-200">
                {tabs.map(t => (
                  <button key={t.key} onClick={() => { setBlogPlatform(t.key); if (t.key !== "frandoor") triggerConvert(t.key); }}
                    className={cn("flex-1 text-[10px] font-medium py-2 border-b-2 transition-colors",
                      activePreview === t.key ? `border-${t.color}-500 text-${t.color}-600 bg-white` : "border-transparent text-slate-400 hover:text-slate-600",
                    )}>
                    {t.label}
                    {t.key !== "frandoor" && blogConvertedResults[t.key] && " ✓"}
                    {blogConverting === t.key && " ..."}
                  </button>
                ))}
                <div className="flex gap-1 px-2">
                  <button onClick={() => setBlogViewMode("preview")}
                    className={cn("text-[9px] px-2 py-0.5 rounded", blogViewMode === "preview" ? "bg-slate-900 text-white" : "text-slate-400")}>미리보기</button>
                  <button onClick={() => setBlogViewMode("html")}
                    className={cn("text-[9px] px-2 py-0.5 rounded", blogViewMode === "html" ? "bg-slate-900 text-white" : "text-slate-400")}>코드</button>
                </div>
              </div>

              <div className="max-h-[500px] overflow-y-auto">
                {blogConverting === activePreview ? (
                  <div className="p-8 text-center text-sm text-slate-400 animate-pulse">
                    {activePreview === "medium" ? "영문 번역 중..." : "채널별 앵글로 생성 중... (30초~1분)"}
                  </div>
                ) : blogViewMode === "preview" ? (
                  isOriginal ? (
                    <iframe
                      srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${OG_WRAP_CSS_INLINE}</head><body style="margin:16px;font-family:-apple-system,'Segoe UI',sans-serif"><div class="og-wrap">${blogResult.content ?? ""}</div></body></html>`}
                      className="w-full border-0" style={{ height: 500 }} sandbox="allow-same-origin" />
                  ) : activePreview === "tistory" && hasConverted ? (
                    <iframe
                      srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${OG_WRAP_CSS_INLINE}</head><body style="margin:16px;font-family:-apple-system,'Segoe UI',sans-serif">${convertedContent}</body></html>`}
                      className="w-full border-0" style={{ height: 500 }} sandbox="allow-same-origin" />
                  ) : activePreview === "naver" && hasConverted ? (
                    <div className="p-4">
                      <pre className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{convertedContent}</pre>
                    </div>
                  ) : activePreview === "medium" && hasConverted ? (
                    <div className="p-4 prose prose-sm max-w-none">
                      <pre className="text-sm text-slate-700 whitespace-pre-wrap font-mono leading-relaxed">{convertedContent}</pre>
                    </div>
                  ) : !isOriginal ? (
                    <div className="p-8 text-center text-sm text-slate-400">탭을 클릭하면 채널별 앵글로 새 글이 생성됩니다</div>
                  ) : null
                ) : (
                  <div className="p-4">
                    <pre className="text-[11px] text-slate-600 whitespace-pre-wrap font-mono leading-relaxed">
                      {isOriginal ? blogResult.content : (convertedContent ?? "변환 결과 없음")}
                    </pre>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-t border-slate-200">
                <span className="text-[10px] text-slate-400">{blogResult.character_count ? `${blogResult.character_count}자` : ""}</span>
                <div className="flex gap-1">
                  {isOriginal && (
                    <button onClick={() => { navigator.clipboard.writeText(blogResult.content ?? ""); alert("원본 HTML 복사됨"); }}
                      className="text-[10px] px-2 py-0.5 rounded bg-blue-100 text-blue-700 hover:bg-blue-200">
                      <Copy className="h-3 w-3 inline mr-0.5" />원본 복사
                    </button>
                  )}
                  {activePreview === "tistory" && hasConverted && (() => {
                    const chMeta = blogAllResults["tistory"] ?? blogResult;
                    return <>
                      <button onClick={() => { navigator.clipboard.writeText(convertedContent!); alert("티스토리 HTML 복사됨"); }}
                        className="text-[10px] px-2 py-0.5 rounded bg-orange-100 text-orange-700 hover:bg-orange-200">
                        <Copy className="h-3 w-3 inline mr-0.5" />HTML 복사
                      </button>
                      <button onClick={async () => {
                        const ok = await savePost("tistory", convertedContent!, chMeta);
                        alert(ok ? "티스토리 초안 저장됨" : "저장 실패");
                      }} className="text-[10px] px-2 py-0.5 rounded bg-orange-50 text-orange-600 hover:bg-orange-100">
                        <Download className="h-3 w-3 inline mr-0.5" />저장
                      </button>
                      <button onClick={async () => {
                        if (!convertedContent || !chMeta.title) return;
                        if (!confirm("티스토리에 발행하시겠습니까?")) return;
                        try {
                          const res = await fetch("/api/geo/tistory/publish", {
                            method: "POST", headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ title: chMeta.title, content: convertedContent, tags: chMeta.keywords ?? [], visibility: 3 }),
                          });
                          const data = await res.json();
                          if (res.ok && data.postUrl) {
                            alert(`발행 완료!\n${data.postUrl}`);
                            window.open(data.postUrl, "_blank");
                          } else {
                            alert(data.error === "TISTORY_TOKEN_EXPIRED" ? "티스토리 인증이 만료됐습니다. 재인증이 필요합니다." : `발행 실패: ${data.error || "알 수 없는 오류"}`);
                          }
                        } catch { alert("발행 실패"); }
                      }} className="text-[10px] px-2 py-0.5 rounded bg-orange-500 text-white hover:bg-orange-600">티스토리 발행</button>
                    </>;
                  })()}
                  {activePreview === "naver" && hasConverted && (() => {
                    const chMeta = blogAllResults["naver"] ?? blogResult;
                    return <>
                      <button onClick={() => { navigator.clipboard.writeText(convertedContent!); alert("네이버 텍스트 복사됨"); }}
                        className="text-[10px] px-2 py-0.5 rounded bg-green-100 text-green-700 hover:bg-green-200">
                        <Copy className="h-3 w-3 inline mr-0.5" />복사
                      </button>
                      <button onClick={async () => {
                        const ok = await savePost("naver", convertedContent!, chMeta);
                        alert(ok ? "네이버 초안 저장됨" : "저장 실패");
                      }} className="text-[10px] px-2 py-0.5 rounded bg-green-50 text-green-600 hover:bg-green-100">
                        <Download className="h-3 w-3 inline mr-0.5" />저장
                      </button>
                      <a href="https://blog.naver.com/MyBlog.naver" target="_blank" rel="noreferrer"
                        className="text-[10px] px-2 py-0.5 rounded bg-green-200 text-green-800 hover:bg-green-300">네이버 열기</a>
                    </>;
                  })()}
                  {activePreview === "medium" && hasConverted && <>
                    <button onClick={() => { navigator.clipboard.writeText(convertedContent!); alert("Markdown 복사됨"); }}
                      className="text-[10px] px-2 py-0.5 rounded bg-slate-200 text-slate-700 hover:bg-slate-300">
                      <Copy className="h-3 w-3 inline mr-0.5" />Markdown 복사
                    </button>
                    <button onClick={async () => {
                      const ok = await savePost("medium", convertedContent!, blogResult);
                      alert(ok ? "Medium 초안 저장됨" : "저장 실패");
                    }} className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-600 hover:bg-slate-200">
                      <Download className="h-3 w-3 inline mr-0.5" />저장
                    </button>
                  </>}
                </div>
              </div>
            </div>

            {blogResult.faq && blogResult.faq.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">FAQ ({blogResult.faq.length}개)</p>
                <div className="space-y-2">
                  {blogResult.faq.map((f, i) => (
                    <div key={i} className="bg-slate-50 rounded-lg p-3">
                      <p className="text-xs font-semibold text-slate-700">Q. {f.q}</p>
                      <p className="text-xs text-slate-500 mt-1">A. {f.a}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {blogResult.schema_markup && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Schema Markup (JSON-LD)</p>
                <pre className="bg-slate-900 text-green-400 text-[10px] rounded-lg p-3 overflow-x-auto max-h-[200px]">{blogResult.schema_markup}</pre>
              </div>
            )}

            {blogResult.seo_score_tips && blogResult.seo_score_tips.length > 0 && (
              <div className="bg-amber-50 rounded-lg p-3">
                <p className="text-xs font-semibold text-amber-700 mb-1">SEO 개선 팁</p>
                <ul className="text-xs text-amber-600 space-y-0.5">
                  {blogResult.seo_score_tips.map((tip, i) => <li key={i}>• {tip}</li>)}
                </ul>
              </div>
            )}

            {blogResult.sources_cited && blogResult.sources_cited.length > 0 && (
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs font-semibold text-slate-500 mb-1">인용 출처</p>
                <div className="flex flex-wrap gap-1">
                  {blogResult.sources_cited.map((s, i) => (
                    <span key={i} className="text-[10px] bg-white border border-slate-200 px-2 py-0.5 rounded">{s}</span>
                  ))}
                </div>
              </div>
            )}

            {blogResult.error && (
              <div className="bg-red-50 rounded-lg p-3 text-xs text-red-600">{blogResult.error}</div>
            )}
          </div>
        ) : (
          <div className="text-center py-16">
            <div className="h-16 w-16 rounded-2xl bg-violet-50 flex items-center justify-center mx-auto mb-4">
              <FileText className="h-8 w-8 text-violet-400" />
            </div>
            <p className="text-lg font-semibold text-slate-700 mb-2">블로그 글 작성기</p>
            <p className="text-sm text-slate-400">우측에서 브랜드 선택 → 주제 입력 → 생성</p>
            <p className="text-xs text-slate-300 mt-1">팩트 데이터 기반 SEO·AEO·GEO 최적화 콘텐츠</p>
          </div>
        )}
      </div>

      {/* 우측: 설정 */}
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">
            <Sparkles className="h-4 w-4 inline mr-1" />글 생성 설정
          </h2>
          <div className="space-y-3">
            {!initialBrandId && (
              <div>
                <Label className="text-xs">브랜드</Label>
                <select value={brandId} onChange={e => setBrandId(e.target.value)}
                  className="mt-1 w-full text-sm border border-slate-200 rounded-md px-2 py-1.5 bg-white">
                  <option value="">브랜드 선택…</option>
                  {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            )}

            <div className="bg-blue-50 rounded-lg px-3 py-2 space-y-1">
              <p className="text-[10px] font-semibold text-blue-800">AI 중복 콘텐츠 방지 — 진입 질문 자동 로테이션</p>
              <p className="text-[10px] text-blue-700">주제에 따라 채널별 앵글이 자동 배분됩니다:</p>
              <p className="text-[10px] text-blue-600">💰 얼마 드냐(비용) / 📈 얼마 남냐(수익) / ⚖️ 왜 이걸 해야 하냐(비교)</p>
              <p className="text-[10px] text-blue-500">예) 비용 주제 → frandoor:비용 / 티스토리:수익 / 네이버:비교</p>
            </div>

            <div>
              <Label className="text-xs">AI 엔진</Label>
              <div className="flex gap-1.5 mt-1">
                {([
                  { key: "claude" as const, label: "Claude Sonnet", ready: true },
                  { key: "openai" as const, label: "GPT 5.4", ready: true },
                  { key: "gemini" as const, label: "Gemini", ready: false },
                ]).map(p => (
                  <button key={p.key} onClick={() => p.ready && setBlogProvider(p.key)}
                    className={cn("flex-1 text-[10px] py-1.5 rounded-md border transition-colors",
                      blogProvider === p.key ? "bg-violet-50 border-violet-300 text-violet-700 font-semibold" : "border-slate-200 text-slate-400",
                      !p.ready && "opacity-40 cursor-not-allowed",
                    )}>
                    {p.label}{!p.ready && " (준비중)"}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-xs">독자 단계</Label>
              <div className="flex gap-1 mt-1">
                {([
                  { key: "awareness" as const, label: "인지", desc: "창업 막연히 고민" },
                  { key: "consideration" as const, label: "비교", desc: "브랜드 비교 중" },
                  { key: "decision" as const, label: "결정", desc: "비용·절차 확인" },
                ]).map(s => (
                  <button key={s.key} onClick={() => setBlogReaderStage(s.key)}
                    className={cn("flex-1 text-center text-[10px] py-1.5 rounded-md border transition-colors",
                      blogReaderStage === s.key ? "bg-slate-900 text-white border-slate-900" : "border-slate-200 text-slate-400 hover:bg-slate-50",
                    )}>
                    <span className="block font-medium">{s.label}</span>
                    <span className="opacity-60">{s.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-xs">검색 의도</Label>
              <div className="flex gap-1 mt-1">
                {([
                  { key: "informational" as const, label: "정보형", desc: "~란, ~뭐야" },
                  { key: "navigational" as const, label: "탐색형", desc: "~추천, ~비교" },
                  { key: "transactional" as const, label: "거래형", desc: "창업비용, 신청" },
                ]).map(s => (
                  <button key={s.key} onClick={() => setBlogSearchIntent(s.key)}
                    className={cn("flex-1 text-center text-[10px] py-1.5 rounded-md border transition-colors",
                      blogSearchIntent === s.key ? "bg-slate-900 text-white border-slate-900" : "border-slate-200 text-slate-400 hover:bg-slate-50",
                    )}>
                    <span className="block font-medium">{s.label}</span>
                    <span className="opacity-60">{s.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-xs">글 주제 *</Label>
              <textarea value={blogTopic} onChange={e => setBlogTopic(e.target.value)}
                className="mt-1 w-full text-sm border rounded-md px-3 py-2 outline-none focus:ring-2 focus:ring-violet-500 resize-none h-20"
                placeholder={`예: ${selectedBrand?.name ?? "브랜드"} 창업비용 총정리\n${selectedBrand?.name ?? "브랜드"} vs 경쟁 브랜드 비교`} />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="text-xs">참고 블로그 (말투·구조 학습용)</Label>
                <button onClick={saveRefLinks} className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-600 hover:bg-slate-200">저장</button>
              </div>
              <p className="text-[10px] text-slate-400 mb-1">잘 쓴 블로그 URL — 톤·구조를 분석해서 반영</p>
              <div className="space-y-1">
                {blogRefLinks.map((link, i) => (
                  <Input key={i} value={link} onChange={e => { const next = [...blogRefLinks]; next[i] = e.target.value; setBlogRefLinks(next); }}
                    className="text-xs h-7" placeholder={`참고 링크 ${i + 1}`} />
                ))}
              </div>
            </div>

            <Button className="w-full" onClick={generate} disabled={blogGenerating || !blogTopic.trim() || !selectedBrand}>
              {blogGenerating ? (
                <><span className="animate-spin mr-1">⏳</span>생성 중...</>
              ) : (
                <><Sparkles className="h-4 w-4 mr-1" />원본 글 생성</>
              )}
            </Button>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-2">자동 최적화 항목</h2>
          <div className="space-y-1.5 text-xs text-slate-500">
            <div className="flex items-center gap-2"><CheckCircle2 className="h-3 w-3 text-emerald-500" />SEO 메타태그 + 키워드 배치</div>
            <div className="flex items-center gap-2"><CheckCircle2 className="h-3 w-3 text-emerald-500" />AEO FAQ 섹션 (AI 답변 최적화)</div>
            <div className="flex items-center gap-2"><CheckCircle2 className="h-3 w-3 text-emerald-500" />GEO 브랜드 노출 키워드 삽입</div>
            <div className="flex items-center gap-2"><CheckCircle2 className="h-3 w-3 text-emerald-500" />Schema Markup (FAQPage, Article)</div>
            <div className="flex items-center gap-2"><CheckCircle2 className="h-3 w-3 text-emerald-500" />팩트 데이터 기반 수치 인용</div>
            <div className="flex items-center gap-2"><CheckCircle2 className="h-3 w-3 text-emerald-500" />공정위 정보공개서 자동 검색</div>
            <div className="flex items-center gap-2"><CheckCircle2 className="h-3 w-3 text-emerald-500" />참고 블로그 톤·구조 학습</div>
          </div>
        </div>
      </div>
    </div>
  );
}
