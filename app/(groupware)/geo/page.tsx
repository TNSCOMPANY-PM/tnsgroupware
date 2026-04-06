"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Play, Trash2, ChevronRight, CheckCircle2, XCircle, TrendingUp, Bot, Search, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { format, parseISO } from "date-fns";
import { ko } from "date-fns/locale";

type Brand = {
  id: string; name: string; landing_url?: string; created_at: string;
  geo_check_runs?: { id: string; run_date: string; score: number; mentioned_count: number; total_prompts: number }[];
};
type Prompt = { id: string; brand_id: string; prompt_text: string; category?: string; sort_order: number };
type CheckItem = { id: string; prompt_text: string; ai_response: string; mentioned: boolean; accuracy_score: number; check_type?: string; category?: string };
type CheckRun = { id: string; run_date: string; model: string; score: number; mentioned_count: number; total_prompts: number; geo_check_items: CheckItem[] };

export default function GeoPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [runs, setRuns] = useState<CheckRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [addBrandOpen, setAddBrandOpen] = useState(false);
  const [addPromptOpen, setAddPromptOpen] = useState(false);
  const [runningCheck, setRunningCheck] = useState(false);
  const [selectedRun, setSelectedRun] = useState<CheckRun | null>(null);
  const [runPage, setRunPage] = useState(0);

  const fetchBrands = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/geo/brands");
    if (res.ok) setBrands(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetchBrands(); }, [fetchBrands]);

  const selectBrand = async (brand: Brand) => {
    setSelectedBrand(brand);
    const [pRes, rRes] = await Promise.all([
      fetch(`/api/geo/prompts?brand_id=${brand.id}`),
      fetch(`/api/geo/check?brand_id=${brand.id}`),
    ]);
    if (pRes.ok) setPrompts(await pRes.json());
    if (rRes.ok) setRuns(await rRes.json());
  };

  const runCheck = async () => {
    if (!selectedBrand || runningCheck) return;
    setRunningCheck(true);
    const res = await fetch("/api/geo/check", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brand_id: selectedBrand.id }),
    });
    if (res.ok) {
      // 결과 리프레시
      const rRes = await fetch(`/api/geo/check?brand_id=${selectedBrand.id}`);
      if (rRes.ok) setRuns(await rRes.json());
      fetchBrands();
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.error || "체크 실패");
    }
    setRunningCheck(false);
  };

  // 브랜드 목록
  if (!selectedBrand) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">GEO 대시보드</h1>
            <p className="text-sm text-slate-500 mt-0.5">AI 검색엔진 노출률 모니터링</p>
          </div>
          <Button onClick={() => setAddBrandOpen(true)}><Plus className="h-4 w-4 mr-1" />브랜드 추가</Button>
        </div>

        {loading ? (
          <div className="text-center py-16 text-slate-400 text-sm">불러오는 중...</div>
        ) : brands.length === 0 ? (
          <div className="text-center py-24">
            <div className="h-16 w-16 rounded-2xl bg-violet-50 flex items-center justify-center mx-auto mb-4">
              <Bot className="h-8 w-8 text-violet-400" />
            </div>
            <p className="text-lg font-semibold text-slate-700 mb-2">아직 등록된 브랜드가 없습니다</p>
            <p className="text-sm text-slate-400 mb-6">모니터링할 브랜드를 추가하세요</p>
            <Button onClick={() => setAddBrandOpen(true)}><Plus className="h-4 w-4 mr-1" />브랜드 추가</Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {brands.map(brand => {
              const latestRun = brand.geo_check_runs?.[0];
              const score = latestRun?.score ?? null;
              return (
                <div key={brand.id} onClick={() => selectBrand(brand)}
                  className="bg-white rounded-xl border border-slate-200 p-5 cursor-pointer hover:shadow-md hover:border-blue-200 transition-all group">
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="font-semibold text-slate-800 group-hover:text-blue-600">{brand.name}</h3>
                    <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-blue-400" />
                  </div>
                  {brand.landing_url && <p className="text-xs text-slate-400 truncate mb-3">{brand.landing_url}</p>}
                  {score !== null ? (
                    <div className="flex items-center gap-3">
                      <div className={cn("text-2xl font-bold", score >= 50 ? "text-emerald-600" : score >= 20 ? "text-amber-500" : "text-red-500")}>
                        {score}%
                      </div>
                      <div className="text-xs text-slate-400">
                        <p>AI 노출률</p>
                        <p>{latestRun!.mentioned_count}/{latestRun!.total_prompts} 프롬프트</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400">아직 체크 안 됨</p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <AddBrandModal open={addBrandOpen} onClose={() => setAddBrandOpen(false)} onCreated={(b) => { setBrands(prev => [b, ...prev]); setAddBrandOpen(false); }} />
      </div>
    );
  }

  // 브랜드 상세
  const exposurePromptCount = prompts.filter(p => !p.category?.startsWith("D3")).length;
  const accuracyPromptCount = prompts.filter(p => p.category?.startsWith("D3")).length;

  // 체크 기록에서 노출률/정확도 계산 헬퍼
  const getRunStats = (r: CheckRun) => {
    const expItems = (r.geo_check_items ?? []).filter(i => i.check_type !== "accuracy");
    const accItems = (r.geo_check_items ?? []).filter(i => i.check_type === "accuracy");
    const expMentioned = expItems.filter(i => i.mentioned).length;
    const expScore = expItems.length > 0 ? Math.round((expMentioned / expItems.length) * 100) : 0;
    const avgAcc = accItems.length > 0 ? Math.round(accItems.reduce((s, i) => s + i.accuracy_score, 0) / accItems.length) : 0;
    return { expItems: expItems.length, expMentioned, expScore, accItems: accItems.length, avgAcc };
  };

  return (
    <div>
      {/* 헤더 */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => setSelectedBrand(null)} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500">
            <ChevronRight className="h-5 w-5 rotate-180" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-900">{selectedBrand.name}</h1>
            {selectedBrand.landing_url && <p className="text-xs text-slate-400">{selectedBrand.landing_url}</p>}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setAddPromptOpen(true)}><Plus className="h-4 w-4 mr-1" />프롬프트 관리</Button>
          <Button size="sm" onClick={runCheck} disabled={runningCheck || prompts.length === 0}>
            {runningCheck ? (
              <><span className="animate-spin mr-1">⏳</span>체크 중... ({prompts.length}개)</>
            ) : (
              <><Play className="h-4 w-4 mr-1" />GEO 체크 실행</>
            )}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 좌측: 체크 기록 + 프롬프트 관리 */}
        <div className="lg:col-span-2 space-y-6">
          {/* 체크 기록 — 최신순 10개 페이징 */}
          {(() => {
            const PAGE_SIZE = 10;
            const [page, setPage] = [runPage, setRunPage];
            const totalPages = Math.ceil(runs.length / PAGE_SIZE);
            const pagedRuns = runs.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
            return (
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-slate-700">체크 기록</h2>
                  <span className="text-xs text-slate-400">{runs.length}회 실행</span>
                </div>
                {runs.length === 0
                  ? <p className="text-sm text-slate-400 py-8 text-center">아직 체크 기록이 없습니다. GEO 체크를 실행하세요.</p>
                  : <>
                      <div className="space-y-2">
                        {pagedRuns.map(r => {
                          const st = getRunStats(r);
                          return (
                            <div key={r.id} className={cn("flex items-center gap-3 p-3 rounded-lg transition-colors group",
                              selectedRun?.id === r.id ? "bg-blue-50 border border-blue-200" : "hover:bg-slate-50 border border-transparent"
                            )}>
                              <button onClick={() => setSelectedRun(r)} className="flex items-center gap-4 flex-1 min-w-0 text-left">
                                <div className="shrink-0 text-center">
                                  <p className="text-sm font-bold text-slate-700">{r.run_date.slice(5)}</p>
                                  <p className="text-[10px] text-slate-400">{r.run_date.slice(0, 4)}</p>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-xs text-slate-500">노출률</span>
                                      <span className={cn("text-sm font-bold", st.expScore >= 50 ? "text-emerald-600" : st.expScore >= 20 ? "text-amber-500" : "text-red-500")}>{st.expScore}%</span>
                                      <span className="text-[10px] text-slate-400">({st.expMentioned}/{st.expItems})</span>
                                    </div>
                                    <div className="w-px h-4 bg-slate-200" />
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-xs text-slate-500">정확도</span>
                                      <span className={cn("text-sm font-bold", st.avgAcc >= 50 ? "text-blue-600" : st.avgAcc >= 20 ? "text-amber-500" : "text-red-500")}>{st.avgAcc}%</span>
                                      <span className="text-[10px] text-slate-400">(D3 {st.accItems}개)</span>
                                    </div>
                                  </div>
                                  <div className="flex gap-1 mt-1.5">
                                    <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                                      <div className={cn("h-1.5 rounded-full", st.expScore >= 50 ? "bg-emerald-500" : st.expScore >= 20 ? "bg-amber-400" : "bg-red-400")} style={{ width: `${st.expScore}%` }} />
                                    </div>
                                    <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                                      <div className={cn("h-1.5 rounded-full", st.avgAcc >= 50 ? "bg-blue-500" : st.avgAcc >= 20 ? "bg-amber-400" : "bg-red-400")} style={{ width: `${st.avgAcc}%` }} />
                                    </div>
                                  </div>
                                </div>
                                <ChevronRight className="h-4 w-4 text-slate-300 shrink-0" />
                              </button>
                              <button onClick={async () => {
                                if (!confirm(`${r.run_date} 체크 기록을 삭제하시겠습니까?`)) return;
                                await fetch(`/api/geo/check?run_id=${r.id}`, { method: "DELETE" });
                                setRuns(prev => prev.filter(x => x.id !== r.id));
                                if (selectedRun?.id === r.id) setSelectedRun(null);
                              }} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 shrink-0 p-1">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                      {totalPages > 1 && (
                        <div className="flex items-center justify-center gap-2 mt-3 pt-3 border-t border-slate-100">
                          <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="text-xs text-slate-500 hover:text-slate-700 disabled:opacity-30">이전</button>
                          <span className="text-xs text-slate-400">{page + 1} / {totalPages}</span>
                          <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="text-xs text-slate-500 hover:text-slate-700 disabled:opacity-30">다음</button>
                        </div>
                      )}
                    </>
                }
              </div>
            );
          })()}

          {/* 프롬프트 관리 */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-700">프롬프트 관리 ({prompts.length})</h2>
              <Button variant="outline" size="sm" onClick={() => setAddPromptOpen(true)}><Plus className="h-3 w-3 mr-1" />추가</Button>
            </div>
            {prompts.length === 0
              ? <p className="text-sm text-slate-400 py-4 text-center">프롬프트를 추가하세요.</p>
              : <div className="space-y-1">
                  {["D0 개인창업 탐색","D1 프랜차이즈 탐색","D2 김밥 카테고리","D3 오공김밥 직접"].map(cat => {
                    const catPrompts = prompts.filter(p => p.category === cat);
                    if (catPrompts.length === 0) return null;
                    return (
                      <div key={cat} className="mb-2">
                        <div className="flex items-center gap-2 mb-1 px-1">
                          <span className={cn("text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded", cat.startsWith("D3") ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-500")}>{cat}</span>
                          <span className="text-[10px] text-slate-400">{cat.startsWith("D3") ? "정확도" : "노출률"} · {catPrompts.length}개</span>
                        </div>
                        {catPrompts.map((p, i) => (
                          <div key={p.id} className="flex items-center justify-between py-1.5 px-3 rounded-lg hover:bg-slate-50 group">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <span className="text-xs text-slate-400 w-4">{i + 1}</span>
                              <span className="text-sm text-slate-700 truncate">{p.prompt_text}</span>
                            </div>
                            <button onClick={async () => {
                              await fetch(`/api/geo/prompts?id=${p.id}`, { method: "DELETE" });
                              setPrompts(prev => prev.filter(x => x.id !== p.id));
                            }} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
            }
          </div>
        </div>

        {/* 우측: 추이 + 직접 확인 */}
        <div className="space-y-6">
          {/* 추이 */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-3">
              <TrendingUp className="h-4 w-4 inline mr-1" />추이
            </h2>
            {runs.length === 0
              ? <p className="text-xs text-slate-400">체크 기록이 없습니다.</p>
              : <div className="space-y-3">
                  <div>
                    <p className="text-[10px] text-slate-400 mb-1">노출률 (D0~D2)</p>
                    {[...runs].reverse().map((r) => {
                      const st = getRunStats(r);
                      return (
                        <div key={r.id} className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] text-slate-400 w-12">{r.run_date.slice(5)}</span>
                          <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                            <div className={cn("h-1.5 rounded-full", st.expScore >= 50 ? "bg-emerald-500" : st.expScore >= 20 ? "bg-amber-400" : "bg-red-400")} style={{ width: `${st.expScore}%` }} />
                          </div>
                          <span className="text-[10px] font-bold text-slate-600 w-8 text-right">{st.expScore}%</span>
                        </div>
                      );
                    })}
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 mb-1">정확도 (D3)</p>
                    {[...runs].reverse().map((r) => {
                      const st = getRunStats(r);
                      return (
                        <div key={r.id} className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] text-slate-400 w-12">{r.run_date.slice(5)}</span>
                          <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                            <div className={cn("h-1.5 rounded-full", st.avgAcc >= 50 ? "bg-blue-500" : st.avgAcc >= 20 ? "bg-amber-400" : "bg-red-400")} style={{ width: `${st.avgAcc}%` }} />
                          </div>
                          <span className="text-[10px] font-bold text-slate-600 w-8 text-right">{st.avgAcc}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
            }
          </div>

          {/* 직접 확인 */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-3">
              <MessageCircle className="h-4 w-4 inline mr-1" />직접 확인하기
            </h2>
            <p className="text-xs text-slate-500 mb-3">아래 질문을 ChatGPT에 직접 입력해보세요:</p>
            <div className="space-y-1.5">
              {prompts.filter(p => !p.category?.startsWith("D3")).slice(0, 5).map((p, i) => (
                <div key={p.id} className="text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2">
                  {i + 1}. &quot;{p.prompt_text}&quot;
                </div>
              ))}
              {exposurePromptCount > 5 && <p className="text-xs text-slate-400 text-center">외 {exposurePromptCount - 5}개...</p>}
            </div>
            <a href="https://chat.openai.com" target="_blank" rel="noreferrer"
              className="mt-3 flex items-center justify-center gap-1.5 text-sm text-blue-600 hover:underline">
              <Search className="h-3.5 w-3.5" />ChatGPT 열기
            </a>
          </div>
        </div>
      </div>

      {/* 상세 결과 — ChatGPT 스타일 대화 UI */}
      {selectedRun && (
        <Dialog open onOpenChange={() => setSelectedRun(null)}>
          <DialogContent className="max-w-3xl max-h-[90vh] p-0 overflow-hidden">
            {/* 헤더: 날짜 선택 */}
            <div className="px-5 py-3 border-b border-slate-200 bg-white sticky top-0 z-10">
              <div className="flex items-center justify-between">
                <div>
                  <DialogHeader className="p-0">
                    <DialogTitle className="text-base">GEO 체크 결과</DialogTitle>
                  </DialogHeader>
                  <p className="text-xs text-slate-400 mt-0.5">{selectedRun.model} · 노출률 {selectedRun.score}% ({selectedRun.mentioned_count}/{selectedRun.total_prompts})</p>
                </div>
                <div className="flex items-center gap-1">
                  {runs.map(r => (
                    <button key={r.id} onClick={() => setSelectedRun(r)}
                      className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                        r.id === selectedRun.id ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                      )}>
                      {r.run_date.slice(5)}
                    </button>
                  ))}
                </div>
              </div>
              {/* 요약 바 — 노출률 + 정확도 분리 */}
              {(() => {
                const exposureItems = (selectedRun.geo_check_items ?? []).filter(i => i.check_type !== "accuracy");
                const accuracyItems = (selectedRun.geo_check_items ?? []).filter(i => i.check_type === "accuracy");
                const exposureMentioned = exposureItems.filter(i => i.mentioned).length;
                const exposureScore = exposureItems.length > 0 ? Math.round((exposureMentioned / exposureItems.length) * 100) : 0;
                const avgAccuracy = accuracyItems.length > 0 ? Math.round(accuracyItems.reduce((s, i) => s + i.accuracy_score, 0) / accuracyItems.length) : 0;
                return (
                  <div className="flex gap-4 mt-3">
                    <div className="flex-1 bg-slate-50 rounded-lg p-3">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">노출률 (D0~D2)</p>
                      <div className="flex items-center gap-2">
                        <span className={cn("text-xl font-bold", exposureScore >= 50 ? "text-emerald-600" : exposureScore >= 20 ? "text-amber-500" : "text-red-500")}>{exposureScore}%</span>
                        <span className="text-xs text-slate-400">{exposureMentioned}/{exposureItems.length}</span>
                      </div>
                      <div className="mt-1 bg-slate-200 rounded-full h-1.5">
                        <div className={cn("h-1.5 rounded-full", exposureScore >= 50 ? "bg-emerald-500" : exposureScore >= 20 ? "bg-amber-400" : "bg-red-400")}
                          style={{ width: `${exposureScore}%` }} />
                      </div>
                    </div>
                    <div className="flex-1 bg-slate-50 rounded-lg p-3">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">정확도 (D3)</p>
                      <div className="flex items-center gap-2">
                        <span className={cn("text-xl font-bold", avgAccuracy >= 50 ? "text-blue-600" : avgAccuracy >= 20 ? "text-amber-500" : "text-red-500")}>{avgAccuracy}%</span>
                        <span className="text-xs text-slate-400">{accuracyItems.length}개 질문</span>
                      </div>
                      <div className="mt-1 bg-slate-200 rounded-full h-1.5">
                        <div className={cn("h-1.5 rounded-full", avgAccuracy >= 50 ? "bg-blue-500" : avgAccuracy >= 20 ? "bg-amber-400" : "bg-red-400")}
                          style={{ width: `${avgAccuracy}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* 대화 목록 */}
            <div className="overflow-y-auto px-5 py-4 space-y-4" style={{ maxHeight: "calc(90vh - 180px)" }}>
              {/* D0~D2 노출률 섹션 */}
              {(() => {
                const exposureItems = (selectedRun.geo_check_items ?? []).filter(i => i.check_type !== "accuracy");
                const accuracyItems = (selectedRun.geo_check_items ?? []).filter(i => i.check_type === "accuracy");
                const categories = [...new Set(exposureItems.map(i => i.category ?? "기타"))];
                return (
                  <>
                    {categories.map(cat => (
                      <div key={cat}>
                        <div className="flex items-center gap-2 mb-3 mt-2">
                          <span className="text-xs font-bold text-slate-500 uppercase tracking-wide bg-slate-100 px-2.5 py-1 rounded">{cat}</span>
                          <span className="text-xs text-slate-400">노출률 체크</span>
                        </div>
                        <div className="space-y-5">
                          {exposureItems.filter(i => (i.category ?? "기타") === cat).map((item) => (
                            <ChatBubble key={item.id} item={item} type="exposure" />
                          ))}
                        </div>
                      </div>
                    ))}

                    {accuracyItems.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-3 mt-4">
                          <span className="text-xs font-bold text-blue-600 uppercase tracking-wide bg-blue-50 px-2.5 py-1 rounded">D3 오공김밥 직접</span>
                          <span className="text-xs text-slate-400">정확도 체크</span>
                        </div>
                        <div className="space-y-5">
                          {accuracyItems.map((item) => (
                            <ChatBubble key={item.id} item={item} type="accuracy" />
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* 프롬프트 추가 모달 */}
      <AddPromptModal open={addPromptOpen} onClose={() => setAddPromptOpen(false)} brandId={selectedBrand.id}
        onCreated={(p) => { setPrompts(prev => [...prev, p]); setAddPromptOpen(false); }} />
    </div>
  );
}

function AddBrandModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (b: Brand) => void }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const res = await fetch("/api/geo/brands", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim(), landing_url: url.trim() || undefined }) });
    if (res.ok) { const b = await res.json(); onCreated(b); setName(""); setUrl(""); }
    setSaving(false);
  };
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>브랜드 추가</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs">브랜드명 *</Label><Input className="mt-1" value={name} onChange={e => setName(e.target.value)} placeholder="오공김밥" /></div>
          <div><Label className="text-xs">랜딩 URL</Label><Input className="mt-1" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..." /></div>
        </div>
        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button onClick={save} disabled={saving || !name.trim()}>{saving ? "저장 중..." : "추가"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddPromptModal({ open, onClose, brandId, onCreated }: { open: boolean; onClose: () => void; brandId: string; onCreated: (p: Prompt) => void }) {
  const [text, setText] = useState("");
  const [category, setCategory] = useState("D0 개인창업 탐색");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!text.trim() || !category) return;
    setSaving(true);
    const res = await fetch("/api/geo/prompts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brand_id: brandId, prompt_text: text.trim(), category }) });
    if (res.ok) { const p = await res.json(); onCreated(p); setText(""); }
    setSaving(false);
  };
  const categories = [
    { value: "D0 개인창업 탐색", label: "D0 — 개인창업 탐색 (노출률)" },
    { value: "D1 프랜차이즈 탐색", label: "D1 — 프랜차이즈 탐색 (노출률)" },
    { value: "D2 김밥 카테고리", label: "D2 — 김밥/분식 카테고리 (노출률)" },
    { value: "D3 오공김밥 직접", label: "D3 — 브랜드 직접 질문 (정확도)" },
  ];
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>프롬프트 추가</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">카테고리 *</Label>
            <select value={category} onChange={e => setCategory(e.target.value)}
              className="mt-1 w-full text-sm border rounded-md px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500">
              {categories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div><Label className="text-xs">프롬프트 *</Label><Input className="mt-1" value={text} onChange={e => setText(e.target.value)} placeholder="김밥 프랜차이즈 창업 추천해줘" /></div>
          <div className="text-xs text-slate-400 bg-slate-50 rounded-lg p-2">
            {category.startsWith("D3")
              ? "💡 브랜드명을 직접 넣는 질문. AI 답변의 정확도를 체크합니다."
              : "💡 브랜드명 없이 일반적으로 질문. AI가 브랜드를 언급하는지 체크합니다."}
          </div>
        </div>
        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button onClick={save} disabled={saving || !text.trim()}>{saving ? "저장 중..." : "추가"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChatBubble({ item, type }: { item: CheckItem; type: "exposure" | "accuracy" }) {
  return (
    <div className="space-y-3">
      {/* 사용자 질문 */}
      <div className="flex justify-end">
        <div className="max-w-[80%] bg-blue-500 text-white rounded-2xl rounded-br-md px-4 py-2.5">
          <p className="text-sm">{item.prompt_text}</p>
        </div>
      </div>
      {/* AI 응답 */}
      <div className="flex gap-3">
        <div className="h-8 w-8 rounded-full bg-[#10a37f] flex items-center justify-center text-white shrink-0">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364l2.0201-1.1638a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.4059-.6813zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0974-2.3616l2.603-1.5018 2.6032 1.5018v3.0036l-2.6032 1.5018-2.603-1.5018z"/></svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="bg-slate-50 rounded-2xl rounded-tl-md px-4 py-3">
            <div className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">{item.ai_response}</div>
          </div>
          <div className="flex items-center gap-2 mt-1.5 px-1">
            {type === "exposure" ? (
              item.mentioned
                ? <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600"><CheckCircle2 className="h-3 w-3" />브랜드 노출</span>
                : <span className="inline-flex items-center gap-1 text-xs font-medium text-red-400"><XCircle className="h-3 w-3" />브랜드 미노출</span>
            ) : (
              <span className={cn("inline-flex items-center gap-1 text-xs font-medium", item.accuracy_score >= 50 ? "text-blue-600" : item.accuracy_score >= 20 ? "text-amber-500" : "text-red-400")}>
                {item.accuracy_score >= 50 ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                정확도 {item.accuracy_score}%
                {item.mentioned ? "" : " · 오류 감지"}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
