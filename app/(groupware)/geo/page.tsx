"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Play, Trash2, ChevronRight, CheckCircle2, XCircle, TrendingUp, Bot, Search, MessageCircle, Download } from "lucide-react";
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
  const [checkProgress, setCheckProgress] = useState({ current: 0, total: 0, currentQ: "" });
  const [trendDetailOpen, setTrendDetailOpen] = useState(false);
  const [monthlyReportOpen, setMonthlyReportOpen] = useState(false);
  const [selectedRun, setSelectedRun] = useState<CheckRun | null>(null);
  const [runPage, setRunPage] = useState(0);

  const fetchBrands = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/geo/brands");
    if (res.ok) setBrands(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetchBrands(); }, [fetchBrands]);

  // SVG 꺾은선 그래프 HTML 생성 (리포트용)
  const svgLineChart = (data: number[], labels: string[], color: string, title: string) => {
    if (data.length === 0) return "";
    const W = 700, H = 160, PL = 30, PR = 10, PT = 10, PB = 25;
    const cW = W - PL - PR, cH = H - PT - PB;
    const max = Math.max(...data, 100);
    const xStep = data.length > 1 ? cW / (data.length - 1) : 0;
    const pts = data.map((v, i) => ({ x: PL + i * xStep, y: PT + cH - (v / max) * cH }));
    const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
    const area = `${line} L${pts[pts.length - 1].x},${PT + cH} L${pts[0].x},${PT + cH} Z`;
    return `<div style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px">
        <span style="font-size:11px;color:#64748b">${title}</span>
        <span style="font-size:12px;font-weight:700;color:${color}">${data[data.length - 1]}%</span>
      </div>
      <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto">
        ${[0, 25, 50, 75, 100].map(v => { const y = PT + cH - (v / max) * cH; return `<line x1="${PL}" y1="${y}" x2="${W - PR}" y2="${y}" stroke="#e2e8f0" stroke-width="0.5"/><text x="${PL - 4}" y="${y + 3}" text-anchor="end" style="font-size:8px;fill:#94a3b8">${v}</text>`; }).join("")}
        <path d="${area}" fill="${color}" opacity="0.08"/>
        <path d="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>
        ${pts.map((p, i) => `<circle cx="${p.x}" cy="${p.y}" r="3" fill="white" stroke="${color}" stroke-width="1.5"/><text x="${p.x}" y="${PT + cH + 16}" text-anchor="middle" style="font-size:8px;fill:#94a3b8">${labels[i]}</text>`).join("")}
      </svg>
    </div>`;
  };

  // 공통 리포트 CSS
  const REPORT_CSS = `
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } @page { margin: 20mm; } }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, 'Segoe UI', sans-serif; color: #1e293b; padding: 40px; max-width: 800px; margin: 0 auto; font-size: 13px; line-height: 1.6; }
    h1 { font-size: 22px; margin-bottom: 4px; }
    h2 { font-size: 16px; margin: 20px 0 8px; }
    .subtitle { color: #64748b; font-size: 12px; margin-bottom: 24px; }
    .summary { display: flex; gap: 16px; margin-bottom: 24px; }
    .summary-card { flex: 1; background: #f8fafc; border-radius: 10px; padding: 16px; text-align: center; }
    .summary-label { font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; }
    .summary-value { font-size: 28px; font-weight: 700; margin: 4px 0; }
    .summary-detail { font-size: 11px; color: #64748b; }
    .green { color: #16a34a; } .blue { color: #2563eb; } .red { color: #dc2626; } .amber { color: #d97706; }
    .section { margin-bottom: 20px; }
    .section-title { font-size: 13px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 2px solid #e2e8f0; }
    .qa { margin-bottom: 16px; page-break-inside: avoid; }
    .q { background: #eff6ff; border-radius: 8px; padding: 10px 14px; margin-bottom: 6px; font-weight: 600; }
    .a { background: #f8fafc; border-radius: 8px; padding: 10px 14px; white-space: pre-wrap; word-break: break-word; }
    .tag { display: inline-block; font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 99px; margin-top: 6px; }
    .tag-yes { background: #dcfce7; color: #16a34a; } .tag-no { background: #fee2e2; color: #dc2626; } .tag-acc { background: #dbeafe; color: #2563eb; }
    .footer { margin-top: 30px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; text-align: center; }
    .matrix { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 24px; }
    .matrix th, .matrix td { border: 1px solid #e2e8f0; padding: 6px 8px; text-align: center; }
    .matrix th { background: #f8fafc; font-weight: 600; color: #64748b; }
    .matrix td.q-cell { text-align: left; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .dot-yes { display: inline-block; width: 18px; height: 18px; border-radius: 50%; background: #16a34a; color: #fff; font-size: 10px; line-height: 18px; }
    .dot-no { display: inline-block; width: 18px; height: 18px; border-radius: 50%; background: #fee2e2; color: #dc2626; font-size: 10px; line-height: 18px; }
    .page-break { page-break-after: always; }
  `;

  // 추이 매트릭스 HTML 생성
  const buildMatrixHtml = (targetRuns: CheckRun[]) => {
    const ePrompts = prompts.filter(p => !p.category?.startsWith("D3"));
    if (targetRuns.length === 0 || ePrompts.length === 0) return "";
    return `<table class="matrix">
      <tr><th style="text-align:left;min-width:200px">질문</th>${targetRuns.map(r => `<th>${r.run_date.slice(5)}</th>`).join("")}</tr>
      ${ePrompts.map(p => `<tr>
        <td class="q-cell" title="${p.prompt_text.replace(/"/g, "&quot;")}">${p.prompt_text.slice(0, 35)}${p.prompt_text.length > 35 ? "..." : ""}</td>
        ${targetRuns.map(r => {
          const it = (r.geo_check_items ?? []).find((i: CheckItem) => i.prompt_text === p.prompt_text);
          return `<td>${it ? (it.mentioned ? '<span class="dot-yes">O</span>' : '<span class="dot-no">X</span>') : '-'}</td>`;
        }).join("")}
      </tr>`).join("")}
      <tr style="font-weight:700;background:#f8fafc">
        <td style="text-align:left">노출률</td>
        ${targetRuns.map(r => `<td>${getRunStats(r).expScore}%</td>`).join("")}
      </tr>
    </table>`;
  };

  // 월간 리포트 다운로드
  const downloadMonthlyReport = (month: string) => {
    const brandName = selectedBrand?.name ?? "";
    const monthRuns = [...runs].filter(r => r.run_date.startsWith(month)).reverse();
    if (monthRuns.length === 0) { alert("해당 월에 체크 기록이 없습니다."); return; }

    const latest = monthRuns[monthRuns.length - 1];
    const first = monthRuns[0];
    const latestSt = getRunStats(latest);
    const firstSt = getRunStats(first);
    const expDiff = latestSt.expScore - firstSt.expScore;
    const accDiff = latestSt.avgAcc - firstSt.avgAcc;
    const expData = monthRuns.map(r => getRunStats(r).expScore);
    const accData = monthRuns.map(r => getRunStats(r).avgAcc);
    const labels = monthRuns.map(r => r.run_date.slice(5));

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>GEO 월간 리포트 — ${brandName} ${month}</title>
<style>${REPORT_CSS}</style></head><body>
<h1>GEO 월간 리포트</h1>
<p class="subtitle">${brandName} · ${month} · 총 ${monthRuns.length}회 체크</p>

<div class="summary">
  <div class="summary-card">
    <div class="summary-label">최종 노출률</div>
    <div class="summary-value ${latestSt.expScore >= 50 ? 'green' : latestSt.expScore >= 20 ? 'amber' : 'red'}">${latestSt.expScore}%</div>
    <div class="summary-detail">${monthRuns.length > 1 ? `${expDiff >= 0 ? "+" : ""}${expDiff}%p 변화` : "첫 측정"}</div>
  </div>
  <div class="summary-card">
    <div class="summary-label">최종 정확도</div>
    <div class="summary-value ${latestSt.avgAcc >= 50 ? 'blue' : latestSt.avgAcc >= 20 ? 'amber' : 'red'}">${latestSt.avgAcc}%</div>
    <div class="summary-detail">${monthRuns.length > 1 ? `${accDiff >= 0 ? "+" : ""}${accDiff}%p 변화` : "첫 측정"}</div>
  </div>
  <div class="summary-card">
    <div class="summary-label">체크 횟수</div>
    <div class="summary-value" style="color:#334155">${monthRuns.length}</div>
    <div class="summary-detail">${month}</div>
  </div>
</div>

<div class="section">
  <div class="section-title">노출률 · 정확도 추이</div>
  ${svgLineChart(expData, labels, "#16a34a", "노출률 (D0~D2)")}
  ${svgLineChart(accData, labels, "#2563eb", "정확도 (D3)")}
</div>

<div class="section">
  <div class="section-title">질문별 노출 추이</div>
  ${buildMatrixHtml(monthRuns)}
</div>
<div class="page-break"></div>

${monthRuns.map((r) => {
  const items = r.geo_check_items ?? [];
  const st = getRunStats(r);
  return `<div class="section" style="page-break-inside:avoid">
    <div class="section-title">${r.run_date} — 노출률 ${st.expScore}% · 정확도 ${st.avgAcc}%</div>
    <table class="matrix">
      <tr><th style="text-align:left;width:40px">분류</th><th style="text-align:left">질문</th><th style="width:60px">결과</th></tr>
      ${items.map((item: CheckItem) => {
        const isD3 = (item.category ?? "").startsWith("D3");
        const catLabel = (item.category ?? "").split(" ")[0];
        return `<tr>
          <td style="font-size:9px;color:#94a3b8">${catLabel}</td>
          <td style="text-align:left;font-size:12px">${item.prompt_text}</td>
          <td>${isD3
            ? `<span style="font-weight:600;color:${item.accuracy_score >= 50 ? '#2563eb' : '#dc2626'}">${item.accuracy_score}%</span>`
            : item.mentioned ? '<span class="dot-yes">O</span>' : '<span class="dot-no">X</span>'
          }</td>
        </tr>`;
      }).join("")}
    </table>
  </div>`;
}).join("")}

<div class="footer">Frandoor GEO Checker · ${month} 월간 리포트 · ${brandName}</div>
</body></html>`;

    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 500); }
  };

  const downloadReport = (run: CheckRun) => {
    const items = run.geo_check_items ?? [];
    const expItems = items.filter(i => i.check_type !== "accuracy");
    const accItems = items.filter(i => i.check_type === "accuracy");
    const expMentioned = expItems.filter(i => i.mentioned).length;
    const expScore = expItems.length > 0 ? Math.round((expMentioned / expItems.length) * 100) : 0;
    const avgAcc = accItems.length > 0 ? Math.round(accItems.reduce((s, i) => s + i.accuracy_score, 0) / accItems.length) : 0;
    const brandName = selectedBrand?.name ?? "";

    // 해당일 전 30일~해당일까지의 run들
    const runDate = new Date(run.run_date);
    const d30ago = new Date(runDate); d30ago.setDate(d30ago.getDate() - 30);
    const d30str = d30ago.toISOString().slice(0, 10);
    const recentRuns = [...runs].filter(r => r.run_date >= d30str && r.run_date <= run.run_date).reverse();
    const trendExpData = recentRuns.map(r => getRunStats(r).expScore);
    const trendAccData = recentRuns.map(r => getRunStats(r).avgAcc);
    const trendLabels = recentRuns.map(r => r.run_date.slice(5));

    // 매트릭스에 D0~D3 표기 (전체 프롬프트)
    const buildFullMatrixHtml = (targetRuns: CheckRun[]) => {
      if (targetRuns.length === 0 || prompts.length === 0) return "";
      const categories = ["D0 개인창업 탐색", "D1 프랜차이즈 탐색", "D2 김밥 카테고리", "D3 오공김밥 직접"];
      return `<table class="matrix">
        <tr><th style="text-align:left;min-width:40px">분류</th><th style="text-align:left;min-width:200px">질문</th>${targetRuns.map(r => `<th>${r.run_date.slice(5)}</th>`).join("")}</tr>
        ${categories.map(cat => {
          const catPrompts = prompts.filter(p => p.category === cat);
          return catPrompts.map(p => {
            const isD3 = cat.startsWith("D3");
            return `<tr>
              <td style="font-size:9px;color:#94a3b8;white-space:nowrap">${cat.split(" ")[0]}</td>
              <td class="q-cell" title="${p.prompt_text.replace(/"/g, "&quot;")}">${p.prompt_text.slice(0, 30)}${p.prompt_text.length > 30 ? "..." : ""}</td>
              ${targetRuns.map(r => {
                const it = (r.geo_check_items ?? []).find((i: CheckItem) => i.prompt_text === p.prompt_text);
                if (!it) return '<td>-</td>';
                if (isD3) return `<td style="font-size:10px;font-weight:600;color:${it.accuracy_score >= 50 ? '#2563eb' : it.accuracy_score >= 20 ? '#d97706' : '#dc2626'}">${it.accuracy_score}%</td>`;
                return `<td>${it.mentioned ? '<span class="dot-yes">O</span>' : '<span class="dot-no">X</span>'}</td>`;
              }).join("")}
            </tr>`;
          }).join("");
        }).join("")}
        <tr style="font-weight:700;background:#f8fafc">
          <td colspan="2" style="text-align:left">노출률 (D0~D2)</td>
          ${targetRuns.map(r => `<td>${getRunStats(r).expScore}%</td>`).join("")}
        </tr>
        <tr style="font-weight:700;background:#f0f9ff">
          <td colspan="2" style="text-align:left">정확도 (D3)</td>
          ${targetRuns.map(r => `<td>${getRunStats(r).avgAcc}%</td>`).join("")}
        </tr>
      </table>`;
    };

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>GEO 체크 리포트 — ${brandName} ${run.run_date}</title>
<style>${REPORT_CSS}</style></head><body>
<h1>GEO 체크 리포트</h1>
<p class="subtitle">${brandName} · ${run.run_date} · ${run.model}</p>

<div class="summary">
  <div class="summary-card">
    <div class="summary-label">노출률 (D0~D2)</div>
    <div class="summary-value ${expScore >= 50 ? 'green' : expScore >= 20 ? 'amber' : 'red'}">${expScore}%</div>
    <div class="summary-detail">${expMentioned} / ${expItems.length} 프롬프트 노출</div>
  </div>
  <div class="summary-card">
    <div class="summary-label">정확도 (D3)</div>
    <div class="summary-value ${avgAcc >= 50 ? 'blue' : avgAcc >= 20 ? 'amber' : 'red'}">${avgAcc}%</div>
    <div class="summary-detail">${accItems.length}개 질문 평균</div>
  </div>
  <div class="summary-card">
    <div class="summary-label">총 질문</div>
    <div class="summary-value" style="color:#334155">${items.length}</div>
    <div class="summary-detail">D0~D2: ${expItems.length} · D3: ${accItems.length}</div>
  </div>
</div>

${recentRuns.length > 1 ? `<div class="section">
  <div class="section-title">최근 30일 추이</div>
  ${svgLineChart(trendExpData, trendLabels, "#16a34a", "노출률 (D0~D2)")}
  ${svgLineChart(trendAccData, trendLabels, "#2563eb", "정확도 (D3)")}
</div>
<div class="section">
  <div class="section-title">질문별 노출 추이</div>
  ${buildFullMatrixHtml(recentRuns)}
</div>
<div class="page-break"></div>` : ""}

${["D0 개인창업 탐색", "D1 프랜차이즈 탐색", "D2 김밥 카테고리", "D3 오공김밥 직접"].map(cat => {
  const catItems = items.filter(i => (i.category ?? "") === cat);
  if (catItems.length === 0) return "";
  const isD3 = cat.startsWith("D3");
  return `<div class="section">
  <div class="section-title">${cat} — ${isD3 ? "정확도 체크" : "노출률 체크"}</div>
  ${catItems.map((item, idx) => `<div class="qa">
    <div class="q">Q${idx + 1}. ${item.prompt_text}</div>
    <div class="a">${item.ai_response.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
    ${isD3
      ? `<span class="tag tag-acc">정확도 ${item.accuracy_score}%</span>`
      : item.mentioned
        ? `<span class="tag tag-yes">브랜드 노출</span>`
        : `<span class="tag tag-no">브랜드 미노출</span>`}
  </div>`).join("")}
</div>`;
}).join("")}

<div class="footer">
  Frandoor GEO Checker · ${run.run_date} · Powered by ${run.model}
</div>
</body></html>`;

    const w = window.open("", "_blank");
    if (w) {
      w.document.write(html);
      w.document.close();
      setTimeout(() => w.print(), 500);
    }
  };

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
    setCheckProgress({ current: 0, total: 0, currentQ: "" });

    // 1. run 생성 + 프롬프트 목록 받기
    const createRes = await fetch("/api/geo/check", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brand_id: selectedBrand.id }),
    });
    if (!createRes.ok) {
      const err = await createRes.json().catch(() => ({}));
      alert(err.error || "체크 시작 실패");
      setRunningCheck(false); return;
    }
    const { run_id, brand_name, prompts: checkPrompts } = await createRes.json();
    setCheckProgress({ current: 0, total: checkPrompts.length, currentQ: "" });

    // 2. 프롬프트 하나씩 순차 실행
    for (let i = 0; i < checkPrompts.length; i++) {
      const p = checkPrompts[i];
      setCheckProgress({ current: i + 1, total: checkPrompts.length, currentQ: p.prompt_text });
      await fetch("/api/geo/check", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ run_id, prompt_id: p.id, prompt_text: p.prompt_text, brand_name, category: p.category }),
      });
    }

    // 3. 최종 점수 업데이트
    await fetch("/api/geo/check", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ run_id }),
    });

    // 4. 리프레시
    const rRes = await fetch(`/api/geo/check?brand_id=${selectedBrand.id}`);
    if (rRes.ok) setRuns(await rRes.json());
    fetchBrands();
    setRunningCheck(false);
    setCheckProgress({ current: 0, total: 0, currentQ: "" });
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
          {runs.length > 0 && <Button variant="outline" size="sm" onClick={() => setMonthlyReportOpen(true)}><Download className="h-4 w-4 mr-1" />월간 리포트</Button>}
          <Button size="sm" onClick={runCheck} disabled={runningCheck || prompts.length === 0}>
            {runningCheck ? (
              <><span className="animate-spin mr-1">⏳</span>{checkProgress.current}/{checkProgress.total} 진행 중</>
            ) : (
              <><Play className="h-4 w-4 mr-1" />GEO 체크 실행</>
            )}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 좌측: 체크 기록 + 프롬프트 관리 */}
        <div className="lg:col-span-2 space-y-6">
          {/* 진행 상태 */}
          {runningCheck && checkProgress.total > 0 && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-blue-700">GEO 체크 진행 중</span>
                <span className="text-xs text-blue-500">{checkProgress.current}/{checkProgress.total}</span>
              </div>
              <div className="bg-blue-100 rounded-full h-2 mb-2">
                <div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: `${(checkProgress.current / checkProgress.total) * 100}%` }} />
              </div>
              <p className="text-xs text-blue-600 truncate">Q{checkProgress.current}: {checkProgress.currentQ}</p>
            </div>
          )}

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
          {/* 추이 — 꺾은선 그래프 */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-700">
                <TrendingUp className="h-4 w-4 inline mr-1" />추이
              </h2>
              {runs.length > 0 && <button onClick={() => setTrendDetailOpen(true)} className="text-xs text-blue-500 hover:underline">상세보기</button>}
            </div>
            {runs.length === 0
              ? <p className="text-xs text-slate-400">체크 기록이 없습니다.</p>
              : (() => {
                  const sorted = [...runs].reverse();
                  const expData = sorted.map(r => getRunStats(r).expScore);
                  const accData = sorted.map(r => getRunStats(r).avgAcc);
                  const labels = sorted.map(r => r.run_date.slice(5));
                  return (
                    <div className="space-y-4">
                      <MiniLineChart data={expData} labels={labels} color="#10b981" label="노출률 (D0~D2)" />
                      <MiniLineChart data={accData} labels={labels} color="#3b82f6" label="정확도 (D3)" />
                    </div>
                  );
                })()
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
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    {runs.slice(0, 5).map(r => (
                      <button key={r.id} onClick={() => setSelectedRun(r)}
                        className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                          r.id === selectedRun.id ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                        )}>
                        {r.run_date.slice(5)}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => downloadReport(selectedRun)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" title="리포트 다운로드">
                    <Download className="h-4 w-4" />
                  </button>
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

      {/* 월간 리포트 월 선택 모달 */}
      {monthlyReportOpen && (
        <Dialog open onOpenChange={() => setMonthlyReportOpen(false)}>
          <DialogContent className="max-w-xs">
            <DialogHeader><DialogTitle>월간 리포트 다운로드</DialogTitle></DialogHeader>
            <div className="space-y-2 py-2">
              {[...new Set(runs.map(r => r.run_date.slice(0, 7)))].sort().reverse().map(m => (
                <button key={m} onClick={() => { downloadMonthlyReport(m); setMonthlyReportOpen(false); }}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-lg hover:bg-slate-50 border border-slate-200 text-left">
                  <span className="text-sm font-medium text-slate-700">{m}</span>
                  <span className="text-xs text-slate-400">{runs.filter(r => r.run_date.startsWith(m)).length}회 체크</span>
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* 추이 상세 모달 */}
      {trendDetailOpen && runs.length > 0 && (
        <TrendDetailModal runs={runs} prompts={prompts} brandName={selectedBrand.name} getRunStats={getRunStats} onClose={() => setTrendDetailOpen(false)} onDownloadMonthly={downloadMonthlyReport} />
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

function MiniLineChart({ data, labels, color, label }: { data: number[]; labels: string[]; color: string; label: string }) {
  if (data.length === 0) return null;
  const W = 280;
  const H = 100;
  const PAD_L = 28;
  const PAD_R = 8;
  const PAD_T = 8;
  const PAD_B = 20;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;

  const max = Math.max(...data, 100);
  const xStep = data.length > 1 ? chartW / (data.length - 1) : 0;

  const points = data.map((v, i) => ({
    x: PAD_L + i * xStep,
    y: PAD_T + chartH - (v / max) * chartH,
    v,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaPath = `${linePath} L${points[points.length - 1].x},${PAD_T + chartH} L${points[0].x},${PAD_T + chartH} Z`;

  const latest = data[data.length - 1];

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] text-slate-400">{label}</p>
        <p className="text-xs font-bold" style={{ color }}>{latest}%</p>
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
        {/* 가이드 라인 */}
        {[0, 25, 50, 75, 100].map(v => {
          const y = PAD_T + chartH - (v / max) * chartH;
          return (
            <g key={v}>
              <line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y} stroke="#e2e8f0" strokeWidth={0.5} />
              <text x={PAD_L - 4} y={y + 3} textAnchor="end" className="text-[8px] fill-slate-400">{v}</text>
            </g>
          );
        })}
        {/* 영역 */}
        <path d={areaPath} fill={color} opacity={0.08} />
        {/* 선 */}
        <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {/* 점 + 라벨 */}
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={3} fill="white" stroke={color} strokeWidth={1.5} />
            <text x={p.x} y={PAD_T + chartH + 14} textAnchor="middle" className="text-[8px] fill-slate-400">{labels[i]}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function TrendDetailModal({ runs, prompts, brandName, getRunStats, onClose, onDownloadMonthly }: {
  runs: CheckRun[]; prompts: Prompt[]; brandName: string;
  getRunStats: (r: CheckRun) => { expItems: number; expMentioned: number; expScore: number; accItems: number; avgAcc: number };
  onClose: () => void;
  onDownloadMonthly: (month: string) => void;
}) {
  const sorted = [...runs].reverse();

  // 월별 그룹핑
  const months: Record<string, typeof sorted> = {};
  sorted.forEach(r => {
    const m = r.run_date.slice(0, 7);
    if (!months[m]) months[m] = [];
    months[m].push(r);
  });
  const monthKeys = Object.keys(months).sort().reverse();
  const [selMonth, setSelMonth] = useState(monthKeys[0] ?? "");

  // 질문별 일별 매트릭스 (노출률용 프롬프트만)
  const expPrompts = prompts.filter(p => !p.category?.startsWith("D3"));
  const monthRuns = months[selMonth] ?? [];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] p-0 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 bg-white sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <DialogHeader className="p-0">
              <DialogTitle className="text-base">{brandName} — 추이 상세</DialogTitle>
            </DialogHeader>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                {monthKeys.map(m => (
                  <button key={m} onClick={() => setSelMonth(m)}
                    className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                      m === selMonth ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                    )}>{m}</button>
                ))}
              </div>
              <button onClick={() => onDownloadMonthly(selMonth)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" title="월간 리포트 다운로드">
                <Download className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-auto p-5" style={{ maxHeight: "calc(90vh - 60px)" }}>
          {/* 월 요약 */}
          <div className="flex gap-4 mb-6">
            {monthRuns.length > 0 && (() => {
              const latest = monthRuns[monthRuns.length - 1];
              const first = monthRuns[0];
              const latestSt = getRunStats(latest);
              const firstSt = getRunStats(first);
              const expDiff = latestSt.expScore - firstSt.expScore;
              const accDiff = latestSt.avgAcc - firstSt.avgAcc;
              return (
                <>
                  <div className="flex-1 bg-emerald-50 rounded-lg p-4 text-center">
                    <p className="text-[10px] text-emerald-600 font-semibold uppercase">노출률</p>
                    <p className="text-2xl font-bold text-emerald-700">{latestSt.expScore}%</p>
                    {monthRuns.length > 1 && <p className={cn("text-xs font-semibold", expDiff >= 0 ? "text-emerald-600" : "text-red-500")}>{expDiff >= 0 ? "+" : ""}{expDiff}%p</p>}
                  </div>
                  <div className="flex-1 bg-blue-50 rounded-lg p-4 text-center">
                    <p className="text-[10px] text-blue-600 font-semibold uppercase">정확도</p>
                    <p className="text-2xl font-bold text-blue-700">{latestSt.avgAcc}%</p>
                    {monthRuns.length > 1 && <p className={cn("text-xs font-semibold", accDiff >= 0 ? "text-blue-600" : "text-red-500")}>{accDiff >= 0 ? "+" : ""}{accDiff}%p</p>}
                  </div>
                  <div className="flex-1 bg-slate-50 rounded-lg p-4 text-center">
                    <p className="text-[10px] text-slate-500 font-semibold uppercase">체크 횟수</p>
                    <p className="text-2xl font-bold text-slate-700">{monthRuns.length}</p>
                    <p className="text-xs text-slate-400">이번 달</p>
                  </div>
                </>
              );
            })()}
          </div>

          {/* 꺾은선 그래프 */}
          {monthRuns.length > 1 && (
            <div className="mb-6 grid grid-cols-2 gap-4">
              <div className="rounded-lg border border-slate-200 p-4">
                <MiniLineChart data={monthRuns.map(r => getRunStats(r).expScore)} labels={monthRuns.map(r => r.run_date.slice(5))} color="#10b981" label="노출률 (D0~D2)" />
              </div>
              <div className="rounded-lg border border-slate-200 p-4">
                <MiniLineChart data={monthRuns.map(r => getRunStats(r).avgAcc)} labels={monthRuns.map(r => r.run_date.slice(5))} color="#3b82f6" label="정확도 (D3)" />
              </div>
            </div>
          )}

          {/* 질문별 일별 노출 매트릭스 */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">질문별 노출 현황 (D0~D2)</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="text-left p-2 border border-slate-200 sticky left-0 bg-slate-50 min-w-[200px]">질문</th>
                    {monthRuns.map(r => (
                      <th key={r.id} className="p-2 border border-slate-200 text-center whitespace-nowrap">{r.run_date.slice(5)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {expPrompts.map(p => (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="p-2 border border-slate-200 sticky left-0 bg-white truncate max-w-[200px]" title={p.prompt_text}>{p.prompt_text}</td>
                      {monthRuns.map(r => {
                        const item = (r.geo_check_items ?? []).find(i => i.prompt_text === p.prompt_text);
                        return (
                          <td key={r.id} className="p-2 border border-slate-200 text-center">
                            {item ? (
                              item.mentioned
                                ? <span className="inline-block w-5 h-5 rounded-full bg-emerald-500 text-white text-[10px] leading-5">O</span>
                                : <span className="inline-block w-5 h-5 rounded-full bg-red-100 text-red-400 text-[10px] leading-5">X</span>
                            ) : <span className="text-slate-300">-</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* D3 정확도 매트릭스 */}
          {prompts.some(p => p.category?.startsWith("D3")) && (
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-3">정확도 현황 (D3)</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="text-left p-2 border border-slate-200 sticky left-0 bg-slate-50 min-w-[200px]">질문</th>
                      {monthRuns.map(r => (
                        <th key={r.id} className="p-2 border border-slate-200 text-center whitespace-nowrap">{r.run_date.slice(5)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {prompts.filter(p => p.category?.startsWith("D3")).map(p => (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <td className="p-2 border border-slate-200 sticky left-0 bg-white truncate max-w-[200px]" title={p.prompt_text}>{p.prompt_text}</td>
                        {monthRuns.map(r => {
                          const item = (r.geo_check_items ?? []).find(i => i.prompt_text === p.prompt_text);
                          return (
                            <td key={r.id} className="p-2 border border-slate-200 text-center">
                              {item ? (
                                <span className={cn("font-semibold", item.accuracy_score >= 50 ? "text-blue-600" : item.accuracy_score >= 20 ? "text-amber-500" : "text-red-400")}>
                                  {item.accuracy_score}%
                                </span>
                              ) : <span className="text-slate-300">-</span>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
