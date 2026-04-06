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
type CheckItem = { id: string; prompt_text: string; ai_response: string; mentioned: boolean; accuracy_score: number };
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
  const latestRun = runs[0];
  const scoreHistory = [...runs].reverse().map(r => ({ date: r.run_date, score: r.score }));

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
          <Button variant="outline" size="sm" onClick={() => setAddPromptOpen(true)}><Plus className="h-4 w-4 mr-1" />프롬프트 추가</Button>
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
        {/* 좌측: 현재 점수 + 프롬프트 */}
        <div className="lg:col-span-2 space-y-6">
          {/* 점수 카드 */}
          {latestRun && (
            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-slate-700">최신 GEO 체크 결과</h2>
                <span className="text-xs text-slate-400">{latestRun.run_date} · {latestRun.model}</span>
              </div>
              <div className="flex items-center gap-6 mb-4">
                <div className={cn("text-4xl font-bold", latestRun.score >= 50 ? "text-emerald-600" : latestRun.score >= 20 ? "text-amber-500" : "text-red-500")}>
                  {latestRun.score}%
                </div>
                <div>
                  <p className="text-sm text-slate-600">AI 노출률</p>
                  <p className="text-xs text-slate-400">{latestRun.mentioned_count}/{latestRun.total_prompts} 프롬프트에서 브랜드 언급</p>
                </div>
              </div>
              {/* 프롬프트별 결과 */}
              <div className="space-y-2">
                {(latestRun.geo_check_items ?? []).map(item => (
                  <div key={item.id} onClick={() => setSelectedRun(latestRun)}
                    className={cn("flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors",
                      item.mentioned ? "bg-emerald-50 hover:bg-emerald-100" : "bg-red-50 hover:bg-red-100"
                    )}>
                    {item.mentioned ? <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" /> : <XCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-700">{item.prompt_text}</p>
                      <p className="text-xs text-slate-500 mt-1 line-clamp-2">{item.ai_response.slice(0, 150)}...</p>
                    </div>
                    {item.mentioned && <span className="text-xs font-bold text-emerald-600 shrink-0">{item.accuracy_score}점</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 프롬프트 목록 */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-700">테스트 프롬프트 ({prompts.length})</h2>
              <Button variant="outline" size="sm" onClick={() => setAddPromptOpen(true)}><Plus className="h-3 w-3 mr-1" />추가</Button>
            </div>
            {prompts.length === 0
              ? <p className="text-sm text-slate-400 py-4 text-center">프롬프트를 추가하세요. GEO 체크 시 이 질문들로 AI에게 물어봅니다.</p>
              : <div className="space-y-1.5">
                  {prompts.map((p, i) => (
                    <div key={p.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-slate-50 group">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="text-xs text-slate-400 w-5">{i + 1}</span>
                        <span className="text-sm text-slate-700 truncate">{p.prompt_text}</span>
                        {p.category && <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded shrink-0">{p.category}</span>}
                      </div>
                      <button onClick={async () => {
                        await fetch(`/api/geo/prompts?id=${p.id}`, { method: "DELETE" });
                        setPrompts(prev => prev.filter(x => x.id !== p.id));
                      }} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  ))}
                </div>
            }
          </div>
        </div>

        {/* 우측: 추이 + 직접 확인 */}
        <div className="space-y-6">
          {/* 추이 */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-3">
              <TrendingUp className="h-4 w-4 inline mr-1" />노출률 추이
            </h2>
            {scoreHistory.length === 0
              ? <p className="text-xs text-slate-400">체크 기록이 없습니다.</p>
              : <div className="space-y-2">
                  {scoreHistory.map((h, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-xs text-slate-400 w-16">{h.date}</span>
                      <div className="flex-1 bg-slate-100 rounded-full h-2">
                        <div className={cn("h-2 rounded-full", h.score >= 50 ? "bg-emerald-500" : h.score >= 20 ? "bg-amber-400" : "bg-red-400")}
                          style={{ width: `${h.score}%` }} />
                      </div>
                      <span className="text-xs font-bold text-slate-600 w-8 text-right">{h.score}%</span>
                    </div>
                  ))}
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
              {prompts.slice(0, 5).map((p, i) => (
                <div key={p.id} className="text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2">
                  {i + 1}. "{p.prompt_text}"
                </div>
              ))}
              {prompts.length > 5 && <p className="text-xs text-slate-400 text-center">외 {prompts.length - 5}개...</p>}
            </div>
            <a href="https://chat.openai.com" target="_blank" rel="noreferrer"
              className="mt-3 flex items-center justify-center gap-1.5 text-sm text-blue-600 hover:underline">
              <Search className="h-3.5 w-3.5" />ChatGPT 열기
            </a>
          </div>

          {/* 체크 기록 */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-3">체크 기록</h2>
            {runs.length === 0
              ? <p className="text-xs text-slate-400">기록이 없습니다.</p>
              : <div className="space-y-1.5">
                  {runs.map(r => (
                    <button key={r.id} onClick={() => setSelectedRun(r)}
                      className="w-full flex items-center justify-between py-2 px-3 rounded-lg hover:bg-slate-50 text-left">
                      <div>
                        <p className="text-xs text-slate-500">{r.run_date}</p>
                        <p className="text-xs text-slate-400">{r.mentioned_count}/{r.total_prompts} 노출</p>
                      </div>
                      <span className={cn("text-sm font-bold", r.score >= 50 ? "text-emerald-600" : r.score >= 20 ? "text-amber-500" : "text-red-500")}>
                        {r.score}%
                      </span>
                    </button>
                  ))}
                </div>
            }
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
              {/* 요약 바 */}
              <div className="flex items-center gap-4 mt-3">
                <div className={cn("text-2xl font-bold", selectedRun.score >= 50 ? "text-emerald-600" : selectedRun.score >= 20 ? "text-amber-500" : "text-red-500")}>
                  {selectedRun.score}%
                </div>
                <div className="flex-1 bg-slate-100 rounded-full h-2.5">
                  <div className={cn("h-2.5 rounded-full transition-all", selectedRun.score >= 50 ? "bg-emerald-500" : selectedRun.score >= 20 ? "bg-amber-400" : "bg-red-400")}
                    style={{ width: `${selectedRun.score}%` }} />
                </div>
                <div className="flex gap-3 text-xs text-slate-500">
                  <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-500" />{selectedRun.mentioned_count} 노출</span>
                  <span className="flex items-center gap-1"><XCircle className="h-3 w-3 text-red-400" />{selectedRun.total_prompts - selectedRun.mentioned_count} 미노출</span>
                </div>
              </div>
            </div>

            {/* 대화 목록 */}
            <div className="overflow-y-auto px-5 py-4 space-y-6" style={{ maxHeight: "calc(90vh - 140px)" }}>
              {(selectedRun.geo_check_items ?? []).map((item, i) => (
                <div key={item.id} className="space-y-3">
                  {/* 사용자 질문 */}
                  <div className="flex justify-end">
                    <div className="max-w-[80%] bg-blue-500 text-white rounded-2xl rounded-br-md px-4 py-2.5">
                      <p className="text-sm">{item.prompt_text}</p>
                    </div>
                  </div>

                  {/* AI 응답 — ChatGPT 스타일 */}
                  <div className="flex gap-3">
                    <div className="h-8 w-8 rounded-full bg-[#10a37f] flex items-center justify-center text-white shrink-0">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364l2.0201-1.1638a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.4059-.6813zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0974-2.3616l2.603-1.5018 2.6032 1.5018v3.0036l-2.6032 1.5018-2.603-1.5018z"/></svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="bg-slate-50 rounded-2xl rounded-tl-md px-4 py-3">
                        <div className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed [&>p]:mb-2">{item.ai_response}</div>
                      </div>
                      {/* 노출 여부 태그 */}
                      <div className="flex items-center gap-2 mt-1.5 px-1">
                        {item.mentioned
                          ? <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600"><CheckCircle2 className="h-3 w-3" />브랜드 노출 · 정확도 {item.accuracy_score}점</span>
                          : <span className="inline-flex items-center gap-1 text-xs font-medium text-red-400"><XCircle className="h-3 w-3" />브랜드 미노출</span>
                        }
                      </div>
                    </div>
                  </div>

                  {i < (selectedRun.geo_check_items?.length ?? 0) - 1 && (
                    <div className="border-t border-dashed border-slate-200 mx-4" />
                  )}
                </div>
              ))}
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
  const [category, setCategory] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!text.trim()) return;
    setSaving(true);
    const res = await fetch("/api/geo/prompts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brand_id: brandId, prompt_text: text.trim(), category: category.trim() || undefined }) });
    if (res.ok) { const p = await res.json(); onCreated(p); setText(""); setCategory(""); }
    setSaving(false);
  };
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>프롬프트 추가</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs">프롬프트 *</Label><Input className="mt-1" value={text} onChange={e => setText(e.target.value)} placeholder="김밥 프랜차이즈 창업 추천해줘" /></div>
          <div><Label className="text-xs">카테고리</Label><Input className="mt-1" value={category} onChange={e => setCategory(e.target.value)} placeholder="일반 창업 탐색 / 브랜드 직접 질문 / ..." /></div>
        </div>
        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button onClick={save} disabled={saving || !text.trim()}>{saving ? "저장 중..." : "추가"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
