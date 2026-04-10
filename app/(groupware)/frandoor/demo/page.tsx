"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

type DemoResult = {
  category: string;
  category_label: string;
  prompt: string;
  ai_response: string;
  brand_mentioned: boolean;
  accuracy_score: number;
};

type DemoReport = {
  brand_name: string;
  category: string;
  checked_at: string;
  summary: { total_prompts: number; exposure_count: number; exposure_rate: number; accuracy_count: number; accuracy_rate: number };
  results: DemoResult[];
};

export default function GeoDemoPage() {
  const [brandName, setBrandName] = useState("");
  const [category, setCategory] = useState("");
  const [running, setRunning] = useState(false);
  const [progress] = useState({ current: 0, total: 0, currentQ: "" });
  const [report, setReport] = useState<DemoReport | null>(null);
  const [expandedCat, setExpandedCat] = useState<string | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const pdfRef = useRef<HTMLDivElement>(null);

  const runDemo = async () => {
    if (!brandName.trim() || !category.trim()) return;
    setRunning(true);
    setReport(null);

    try {
      const res = await fetch("/api/geo/demo-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand_name: brandName.trim(), category: category.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setReport(data);
      } else {
        alert("체크 실패");
      }
    } catch {
      alert("체크 실패");
    }
    setRunning(false);
  };

  const sharePdf = async () => {
    if (!report || !pdfRef.current) return;
    setGeneratingPdf(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const { jsPDF } = await import("jspdf");

      const canvas = await html2canvas(pdfRef.current, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false,
      });

      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgW = pageW;
      const imgH = (canvas.height * imgW) / canvas.width;

      let heightLeft = imgH;
      let position = 0;
      const imgData = canvas.toDataURL("image/jpeg", 0.92);

      pdf.addImage(imgData, "JPEG", 0, position, imgW, imgH);
      heightLeft -= pageH;

      while (heightLeft > 0) {
        position = heightLeft - imgH;
        pdf.addPage();
        pdf.addImage(imgData, "JPEG", 0, position, imgW, imgH);
        heightLeft -= pageH;
      }

      const blob = pdf.output("blob");
      const filename = `${report.brand_name}_GEO리포트_${report.checked_at.slice(0, 10)}.pdf`;
      const file = new File([blob], filename, { type: "application/pdf" });

      const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean };
      if (nav.canShare && nav.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: `${report.brand_name} GEO 리포트`,
            text: `AI 노출률 ${report.summary.exposure_rate}% · 답변 정확도 ${report.summary.accuracy_rate}%`,
          });
        } catch (err) {
          // 사용자가 공유 시트 취소한 경우 → 무시
          if (err instanceof Error && err.name === "AbortError") return;
          throw err;
        }
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        alert("이 브라우저는 공유 시트를 지원하지 않아 PDF를 다운로드했습니다.");
      }
    } catch (e) {
      alert("PDF 생성 실패: " + (e instanceof Error ? e.message : "알 수 없는 오류"));
    }
    setGeneratingPdf(false);
  };

  // 리포트 화면
  if (report) {
    const cats = ["D0", "D1", "D2", "D3"];
    const catLabels: Record<string, string> = {};
    for (const r of report.results) { if (!catLabels[r.category]) catLabels[r.category] = r.category_label; }

    return (
      <div className="max-w-lg mx-auto px-4 py-6">
        {/* 헤더 */}
        <div className="text-center mb-6">
          <p className="text-xs text-slate-400 mb-1">Frandoor GEO 리포트</p>
          <h1 className="text-2xl font-bold text-slate-900">{report.brand_name}</h1>
          <p className="text-sm text-slate-500">{report.category} 카테고리 | {report.checked_at.slice(0, 10)}</p>
        </div>

        {/* 요약 카드 */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <p className={cn("text-3xl font-bold", report.summary.exposure_rate >= 50 ? "text-emerald-600" : report.summary.exposure_rate >= 20 ? "text-amber-500" : "text-red-500")}>{report.summary.exposure_rate}%</p>
            <p className="text-xs text-slate-400 mt-1">AI 노출률</p>
            <p className="text-[10px] text-slate-300">{report.summary.exposure_count}/{report.summary.total_prompts - 7}개 노출</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <p className={cn("text-3xl font-bold", report.summary.accuracy_rate >= 50 ? "text-blue-600" : report.summary.accuracy_rate >= 20 ? "text-amber-500" : "text-red-500")}>{report.summary.accuracy_rate}%</p>
            <p className="text-xs text-slate-400 mt-1">답변 정확도</p>
            <p className="text-[10px] text-slate-300">D3 {report.summary.accuracy_count}/7개 정확</p>
          </div>
        </div>

        {/* 카테고리별 상세 */}
        <div className="space-y-2 mb-6">
          {cats.map(cat => {
            const items = report.results.filter(r => r.category === cat);
            if (items.length === 0) return null;
            const isD3 = cat === "D3";
            const successCount = isD3 ? items.filter(r => r.accuracy_score >= 50).length : items.filter(r => r.brand_mentioned).length;
            const expanded = expandedCat === cat;

            return (
              <div key={cat} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <button onClick={() => setExpandedCat(expanded ? null : cat)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left">
                  <div className="flex items-center gap-2">
                    <span className={cn("text-xs font-bold px-2 py-0.5 rounded",
                      successCount > 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"
                    )}>{cat}</span>
                    <span className="text-sm text-slate-700">{catLabels[cat] ?? cat}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn("text-xs font-semibold", successCount > 0 ? "text-emerald-600" : "text-red-500")}>
                      {successCount}/{items.length} {isD3 ? "정확" : "노출"}
                    </span>
                    <span className="text-slate-300">{expanded ? "▲" : "▼"}</span>
                  </div>
                </button>
                {expanded && (
                  <div className="border-t border-slate-100 px-4 py-2 space-y-1">
                    {items.map((item, i) => (
                      <details key={i} className="py-1 border-b border-slate-50 last:border-0">
                        <summary className="flex items-start gap-2 cursor-pointer list-none py-1">
                          <span className="text-sm mt-0.5 shrink-0">{(isD3 ? item.accuracy_score >= 50 : item.brand_mentioned) ? "✅" : "❌"}</span>
                          <span className="text-sm text-slate-700 flex-1">{item.prompt}</span>
                          <span className="text-[10px] text-slate-300 shrink-0 mt-1">▼</span>
                        </summary>
                        <div className="ml-7 mt-1 mb-2 bg-slate-50 rounded-lg p-3">
                          <p className="text-xs text-slate-600 whitespace-pre-wrap leading-relaxed">{item.ai_response}</p>
                          {isD3 && <p className="text-[10px] text-slate-400 mt-2">정확도: {item.accuracy_score}%</p>}
                        </div>
                      </details>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* 인사이트 */}
        <div className="bg-slate-50 rounded-xl p-4 mb-6">
          <p className="text-sm font-semibold text-slate-700 mb-2">AI 추천 인사이트</p>
          <div className="space-y-2 text-xs text-slate-600">
            {report.summary.exposure_rate === 0 && <p>• AI 검색에서 브랜드 노출이 전혀 없습니다. GEO 최적화 콘텐츠 제작이 시급합니다.</p>}
            {report.summary.exposure_rate > 0 && report.summary.exposure_rate < 30 && <p>• AI 검색 노출률 {report.summary.exposure_rate}%. 콘텐츠 강화로 노출 확대가 가능합니다.</p>}
            {report.summary.accuracy_rate === 0 && <p>• AI가 {report.brand_name}에 대해 정확한 정보를 제공하지 못하고 있습니다. 팩트데이터 구축이 필요합니다.</p>}
            {report.summary.accuracy_rate > 0 && report.summary.accuracy_rate < 50 && <p>• 브랜드 정보 정확도 {report.summary.accuracy_rate}%. 공식 데이터 기반 콘텐츠로 개선 가능합니다.</p>}
          </div>
          <div className="mt-3 pt-3 border-t border-slate-200 text-center">
            <p className="text-xs text-slate-500">Frandoor GEO 서비스로 AI 검색 노출을 개선하세요.</p>
            <p className="text-xs text-blue-500 mt-0.5">frandoor.co.kr</p>
          </div>
        </div>

        {/* 버튼 바 */}
        <div className="sticky bottom-4 flex gap-2">
          <button onClick={() => setReport(null)}
            className="flex-1 py-3 rounded-xl border border-slate-200 text-sm text-slate-600 bg-white">
            다시 체크
          </button>
          <button onClick={sharePdf}
            disabled={generatingPdf}
            className="flex-1 py-3 rounded-xl bg-violet-600 text-white text-sm font-semibold disabled:opacity-50">
            {generatingPdf ? "PDF 생성 중..." : "PDF 공유"}
          </button>
        </div>

        {/* PDF용 숨김 렌더 (오프스크린, 항상 전체 펼침) */}
        <div style={{ position: "fixed", left: "-99999px", top: 0, pointerEvents: "none" }} aria-hidden="true">
          <div ref={pdfRef} style={{
            width: "794px",
            backgroundColor: "#ffffff",
            padding: "40px 36px",
            fontFamily: "Pretendard, -apple-system, 'Segoe UI', sans-serif",
            color: "#0f172a",
          }}>
            {/* 헤더 */}
            <div style={{ textAlign: "center", marginBottom: "28px", paddingBottom: "20px", borderBottom: "2px solid #0f172a" }}>
              <p style={{ fontSize: "12px", color: "#94a3b8", margin: 0, letterSpacing: "0.05em" }}>FRANDOOR GEO REPORT</p>
              <h1 style={{ fontSize: "32px", fontWeight: 700, color: "#0f172a", margin: "8px 0 4px" }}>{report.brand_name}</h1>
              <p style={{ fontSize: "14px", color: "#64748b", margin: 0 }}>{report.category} 카테고리 · {report.checked_at.slice(0, 10)}</p>
            </div>

            {/* 요약 */}
            <div style={{ display: "flex", gap: "16px", marginBottom: "28px" }}>
              <div style={{ flex: 1, border: "1px solid #e2e8f0", borderRadius: "12px", padding: "20px", textAlign: "center" }}>
                <div style={{ fontSize: "40px", fontWeight: 700, color: report.summary.exposure_rate >= 50 ? "#059669" : report.summary.exposure_rate >= 20 ? "#f59e0b" : "#ef4444", lineHeight: 1 }}>
                  {report.summary.exposure_rate}%
                </div>
                <div style={{ fontSize: "13px", color: "#64748b", marginTop: "8px", fontWeight: 500 }}>AI 노출률</div>
                <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "2px" }}>{report.summary.exposure_count} / {report.summary.total_prompts - 7}개 노출</div>
              </div>
              <div style={{ flex: 1, border: "1px solid #e2e8f0", borderRadius: "12px", padding: "20px", textAlign: "center" }}>
                <div style={{ fontSize: "40px", fontWeight: 700, color: report.summary.accuracy_rate >= 50 ? "#2563eb" : report.summary.accuracy_rate >= 20 ? "#f59e0b" : "#ef4444", lineHeight: 1 }}>
                  {report.summary.accuracy_rate}%
                </div>
                <div style={{ fontSize: "13px", color: "#64748b", marginTop: "8px", fontWeight: 500 }}>답변 정확도</div>
                <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "2px" }}>D3 {report.summary.accuracy_count} / 7개 정확</div>
              </div>
            </div>

            {/* 인사이트 */}
            <div style={{ backgroundColor: "#f8fafc", borderRadius: "12px", padding: "16px 20px", marginBottom: "28px" }}>
              <div style={{ fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "8px" }}>AI 분석 인사이트</div>
              <div style={{ fontSize: "12px", color: "#475569", lineHeight: 1.7 }}>
                {report.summary.exposure_rate === 0 && <div>• AI 검색에서 브랜드 노출이 전혀 없습니다. GEO 최적화 콘텐츠 제작이 시급합니다.</div>}
                {report.summary.exposure_rate > 0 && report.summary.exposure_rate < 30 && <div>• AI 검색 노출률 {report.summary.exposure_rate}%. 콘텐츠 강화로 노출 확대가 가능합니다.</div>}
                {report.summary.exposure_rate >= 30 && report.summary.exposure_rate < 60 && <div>• AI 검색 노출률 {report.summary.exposure_rate}%. 핵심 키워드 보강으로 추가 개선 가능합니다.</div>}
                {report.summary.exposure_rate >= 60 && <div>• AI 검색 노출률 {report.summary.exposure_rate}%. 우수한 노출 수준입니다.</div>}
                {report.summary.accuracy_rate === 0 && <div>• AI가 {report.brand_name}에 대해 정확한 정보를 제공하지 못하고 있습니다. 팩트데이터 구축이 필요합니다.</div>}
                {report.summary.accuracy_rate > 0 && report.summary.accuracy_rate < 50 && <div>• 브랜드 정보 정확도 {report.summary.accuracy_rate}%. 공식 데이터 기반 콘텐츠로 개선 가능합니다.</div>}
                {report.summary.accuracy_rate >= 50 && <div>• 브랜드 정보 정확도 {report.summary.accuracy_rate}%. AI가 비교적 정확한 정보를 제공하고 있습니다.</div>}
              </div>
            </div>

            {/* 카테고리별 전체 Q&A */}
            {cats.map(cat => {
              const items = report.results.filter(r => r.category === cat);
              if (items.length === 0) return null;
              const isD3 = cat === "D3";
              const successCount = isD3 ? items.filter(r => r.accuracy_score >= 50).length : items.filter(r => r.brand_mentioned).length;
              return (
                <div key={cat} style={{ marginBottom: "24px", pageBreakInside: "avoid" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px", paddingBottom: "8px", borderBottom: "1px solid #e2e8f0" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span style={{ fontSize: "12px", fontWeight: 700, padding: "3px 8px", borderRadius: "4px", backgroundColor: successCount > 0 ? "#d1fae5" : "#fee2e2", color: successCount > 0 ? "#047857" : "#dc2626" }}>{cat}</span>
                      <span style={{ fontSize: "14px", fontWeight: 600, color: "#334155" }}>{catLabels[cat] ?? cat}</span>
                    </div>
                    <span style={{ fontSize: "12px", fontWeight: 600, color: successCount > 0 ? "#059669" : "#dc2626" }}>
                      {successCount}/{items.length} {isD3 ? "정확" : "노출"}
                    </span>
                  </div>
                  <div>
                    {items.map((item, i) => {
                      const ok = isD3 ? item.accuracy_score >= 50 : item.brand_mentioned;
                      return (
                        <div key={i} style={{ marginBottom: "12px", pageBreakInside: "avoid" }}>
                          <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", marginBottom: "6px" }}>
                            <span style={{ fontSize: "12px", marginTop: "1px" }}>{ok ? "✓" : "✗"}</span>
                            <div style={{ fontSize: "12px", fontWeight: 600, color: "#1e293b", flex: 1, lineHeight: 1.5 }}>{item.prompt}</div>
                          </div>
                          <div style={{ marginLeft: "20px", backgroundColor: "#f8fafc", borderRadius: "8px", padding: "10px 12px", borderLeft: `3px solid ${ok ? "#10b981" : "#ef4444"}` }}>
                            <div style={{ fontSize: "11px", color: "#475569", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{item.ai_response}</div>
                            {isD3 && <div style={{ fontSize: "10px", color: "#94a3b8", marginTop: "6px" }}>정확도: {item.accuracy_score}%</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* 푸터 */}
            <div style={{ marginTop: "32px", paddingTop: "20px", borderTop: "1px solid #e2e8f0", textAlign: "center" }}>
              <div style={{ fontSize: "11px", color: "#64748b", marginBottom: "4px" }}>Frandoor GEO 서비스로 AI 검색 노출을 개선하세요</div>
              <div style={{ fontSize: "12px", color: "#2563eb", fontWeight: 600 }}>frandoor.co.kr</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 입력 폼
  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <div className="text-center mb-8">
        <div className="w-14 h-14 rounded-2xl bg-violet-100 flex items-center justify-center mx-auto mb-3">
          <span className="text-2xl">🎯</span>
        </div>
        <h1 className="text-xl font-bold text-slate-900">GEO 시연 체크</h1>
        <p className="text-sm text-slate-500 mt-1">브랜드의 AI 검색 노출 현황을 즉시 확인</p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-slate-700">브랜드명 *</label>
          <input type="text" value={brandName} onChange={e => setBrandName(e.target.value)}
            placeholder="예: 오공김밥"
            className="mt-1 w-full text-base border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-violet-500" />
        </div>

        <div>
          <label className="text-sm font-medium text-slate-700">카테고리 *</label>
          <input type="text" value={category} onChange={e => setCategory(e.target.value)}
            placeholder="예: 김밥, 치킨, 커피, 2차술집"
            className="mt-1 w-full text-base border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-violet-500" />
        </div>

        <button onClick={runDemo}
          disabled={running || !brandName.trim() || !category.trim()}
          className="w-full py-4 rounded-xl bg-violet-600 text-white text-base font-semibold disabled:opacity-50 disabled:cursor-not-allowed">
          {running ? (
            <span className="animate-pulse">GEO 체크 중... ({progress.current}/{progress.total})</span>
          ) : (
            "GEO 체크 시작 →"
          )}
        </button>

        {running && (
          <div className="bg-violet-50 rounded-xl p-4 text-center">
            <div className="bg-violet-200 rounded-full h-2 mb-2">
              <div className="bg-violet-600 h-2 rounded-full transition-all" style={{ width: "50%" }} />
            </div>
            <p className="text-xs text-violet-600">25개 프롬프트로 AI 검색 노출 확인 중...</p>
            <p className="text-[10px] text-violet-400 mt-1">약 2~3분 소요</p>
          </div>
        )}
      </div>
    </div>
  );
}
