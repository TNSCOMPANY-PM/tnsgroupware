"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Plus, Play, Trash2, ChevronRight, CheckCircle2, XCircle, TrendingUp, Bot, Search, MessageCircle, Download, Upload, FileText, Copy, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { OG_WRAP_CSS as OG_WRAP_CSS_INLINE } from "@/constants/blogCssTemplate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { format, parseISO } from "date-fns";
import { ko } from "date-fns/locale";

type BrandPlan = {
  auto_enabled: boolean;
  auto_time: string; // "09:00" 형식
  geo_check: boolean;
  aeo_check: boolean;
  seo_check: boolean;
  blog_tistory: boolean;
  blog_naver: boolean;
  blog_frandoor: boolean;
  blog_medium: boolean;
};
const DEFAULT_PLAN: BrandPlan = { auto_enabled: false, auto_time: "09:00", geo_check: true, aeo_check: false, seo_check: true, blog_tistory: true, blog_naver: true, blog_frandoor: true, blog_medium: false };
type BrandPlanBoolKey = Exclude<keyof BrandPlan, "auto_time">;
const PLAN_LABELS: { key: BrandPlanBoolKey; label: string; group: string }[] = [
  { key: "geo_check", label: "GEO 체크", group: "모니터링" },
  { key: "aeo_check", label: "AEO 체크", group: "모니터링" },
  { key: "seo_check", label: "SEO 체크", group: "모니터링" },
  { key: "blog_tistory", label: "티스토리", group: "블로그 발행" },
  { key: "blog_naver", label: "네이버", group: "블로그 발행" },
  { key: "blog_frandoor", label: "frandoor", group: "블로그 발행" },
  { key: "blog_medium", label: "Medium", group: "블로그 발행" },
];
function getBrandPlan(brand: Brand): BrandPlan {
  if (!brand.fact_data || !Array.isArray(brand.fact_data)) return DEFAULT_PLAN;
  const entry = brand.fact_data.find((d: { label: string }) => d.label === "__brand_plan__");
  if (!entry) return DEFAULT_PLAN;
  try { return { ...DEFAULT_PLAN, ...JSON.parse((entry as { keyword: string }).keyword) }; } catch { return DEFAULT_PLAN; }
}

type Brand = {
  id: string; name: string; landing_url?: string; created_at: string;
  fact_data?: { keyword: string; label: string }[];
  fact_file_url?: string;
  geo_check_runs?: { id: string; run_date: string; score: number; mentioned_count: number; total_prompts: number }[];
};
type Prompt = { id: string; brand_id: string; prompt_text: string; category?: string; sort_order: number };
type CheckItem = { id: string; prompt_text: string; ai_response: string; mentioned: boolean; accuracy_score: number; check_type?: string; category?: string };
type CheckRun = { id: string; run_date: string; model: string; score: number; mentioned_count: number; total_prompts: number; geo_check_items: CheckItem[] };

const OUR_DOMAINS_CLIENT = ["frandoor.co.kr", "frandoor", "50gimbab", "hanshinudong", "jangsajang"];

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
  const [checkTab, setCheckTab] = useState<"regular" | "before">("regular");
  const [mainTab, setMainTab] = useState<"check" | "seo" | "aeo" | "blog">("check");
  const [aeoAiRunning, setAeoAiRunning] = useState(false);
  const [aeoAiPlatform, setAeoAiPlatform] = useState<"google" | "naver">("google");
  type AeoAiRun = { id: string; platform: string; total_keywords: number; cited_count: number; score: number; created_at: string; results: AeoAiResultItem[] };
  type AeoAiResultItem = { keyword: string; platform: string; cited: boolean; our_mentions: string[]; ai_summary: string; source_urls: string[] };
  const [aeoAiRuns, setAeoAiRuns] = useState<AeoAiRun[]>([]);
  const [aeoAiSelectedRun, setAeoAiSelectedRun] = useState<AeoAiRun | null>(null);
  const [aeoAiResults, setAeoAiResults] = useState<AeoAiResultItem[] | null>(null);
  const [aeoAiScore, setAeoAiScore] = useState<{ cited_count: number; total: number; score: number } | null>(null);
  const [aeoAiDetail, setAeoAiDetail] = useState<AeoAiResultItem | null>(null);
  type AeoKeyword = { id: string; keyword: string; sort_order: number };
  type AeoResult = {
    keyword: string; keyword_id: string; platform: string;
    blog_cited: boolean; web_cited: boolean;
    best_rank: number; our_urls: string[];
    blog_results: { title: string; link: string; rank: number; is_ours: boolean }[];
    web_results: { title: string; link: string; rank: number; is_ours: boolean }[];
  };
  const [aeoKeywords, setAeoKeywords] = useState<AeoKeyword[]>([]);
  const [aeoNewKeyword, setAeoNewKeyword] = useState("");
  const [aeoRunning, setAeoRunning] = useState(false);
  const [aeoResults, setAeoResults] = useState<AeoResult[] | null>(null);
  const [aeoPlatform, setAeoPlatform] = useState<"google" | "naver">("google");
  const [aeoScore, setAeoScore] = useState<{ cited_count: number; total: number; score: number } | null>(null);
  const [blogPlatform, setBlogPlatform] = useState<"tistory" | "naver" | "frandoor" | "medium">("frandoor");
  const [blogTopic, setBlogTopic] = useState("");
  const [blogProvider, setBlogProvider] = useState<"openai" | "gemini" | "claude">("claude");
  const [blogReaderStage, setBlogReaderStage] = useState<"awareness" | "consideration" | "decision">("decision");
  const [blogSearchIntent, setBlogSearchIntent] = useState<"informational" | "navigational" | "transactional">("transactional");
  const [blogGenerating, setBlogGenerating] = useState(false);
  type BlogResultType = { title?: string; meta_description?: string; keywords?: string[]; content?: string; faq?: { q: string; a: string }[]; schema_markup?: string; seo_score_tips?: string[]; sources_cited?: string[]; character_count?: number; error?: string };
  const [blogResult, setBlogResult] = useState<BlogResultType | null>(null);
  const [blogAllResults, setBlogAllResults] = useState<Record<string, BlogResultType>>({});
  const [blogAllGenerating, setBlogAllGenerating] = useState(false);
  const [blogConverting, setBlogConverting] = useState<string | null>(null);
  const [blogConvertedResults, setBlogConvertedResults] = useState<Record<string, string>>({});
  const [blogViewMode, setBlogViewMode] = useState<"preview" | "html">("preview");
  const [blogRefLinks, setBlogRefLinks] = useState<string[]>(["", "", "", "", ""]);

  // D0~D3 설명
  const DEPTH_DESC: Record<string, string> = {
    "D0": "일반 창업 질문 → 브랜드 자발적 추천 여부",
    "D1": "프랜차이즈 탐색 → 브랜드 추천 여부",
    "D2": "김밥/분식 카테고리 → 브랜드 노출 여부",
    "D3": "브랜드 직접 질문 → 답변 정확도",
  };

  // runs를 regular/before로 필터
  const regularRuns = runs.filter(r => !r.model.startsWith("before:"));
  const beforeRuns = runs.filter(r => r.model.startsWith("before:"));
  const filteredRuns = checkTab === "before" ? beforeRuns : regularRuns;

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
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      @page { margin: 12mm 15mm; size: A4; }
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, 'Segoe UI', sans-serif; color: #1e293b; padding: 32px; max-width: 800px; margin: 0 auto; font-size: 12px; line-height: 1.5; }
    h1 { font-size: 20px; margin-bottom: 2px; }
    h2 { font-size: 15px; margin: 16px 0 6px; }
    .subtitle { color: #64748b; font-size: 11px; margin-bottom: 20px; }
    .summary { display: flex; gap: 12px; margin-bottom: 20px; }
    .summary-card { flex: 1; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; text-align: center; }
    .summary-label { font-size: 10px; color: #94a3b8; letter-spacing: 0.5px; }
    .summary-value { font-size: 26px; font-weight: 700; margin: 2px 0; }
    .summary-detail { font-size: 10px; color: #64748b; }
    .green { color: #16a34a; } .blue { color: #2563eb; } .red { color: #dc2626; } .amber { color: #d97706; }
    .section { margin-bottom: 16px; }
    .section-title { font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 2px solid #e2e8f0; }
    .qa { margin-bottom: 10px; }
    .q { background: #eff6ff; border-radius: 8px; padding: 8px 12px; margin-bottom: 4px; font-weight: 600; font-size: 12px; }
    .a { background: #f8fafc; border-radius: 8px; padding: 8px 12px; white-space: pre-wrap; word-break: break-word; font-size: 11px; line-height: 1.5; }
    .tag { display: inline-block; font-size: 9px; font-weight: 600; padding: 2px 8px; border-radius: 99px; }
    .tag-yes { background: #dcfce7; color: #16a34a; } .tag-no { background: #fee2e2; color: #dc2626; } .tag-acc { background: #dbeafe; color: #2563eb; }
    .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #94a3b8; text-align: center; }
    .matrix { width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 16px; }
    .matrix th, .matrix td { border: 1px solid #e2e8f0; padding: 5px 6px; text-align: center; }
    .matrix th { background: #f8fafc; font-weight: 600; color: #64748b; }
    .matrix td.q-cell { text-align: left; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .dot-yes { display: inline-block; width: 16px; height: 16px; border-radius: 50%; background: #16a34a; color: #fff; font-size: 9px; line-height: 16px; }
    .dot-no { display: inline-block; width: 16px; height: 16px; border-radius: 50%; background: #fee2e2; color: #dc2626; font-size: 9px; line-height: 16px; }
    .result-table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 16px; }
    .result-table th, .result-table td { border: 1px solid #e2e8f0; padding: 7px 10px; }
    .result-table th { background: #f8fafc; font-weight: 600; color: #64748b; text-align: center; font-size: 10px; }
    .result-table td { text-align: left; }
    .result-table td.center { text-align: center; }
    .badge { display: inline-block; font-size: 9px; font-weight: 600; padding: 2px 8px; border-radius: 4px; }
    .badge-exposed { background: #dcfce7; color: #16a34a; }
    .badge-missed { background: #fee2e2; color: #dc2626; }
    .badge-partial { background: #fef3c7; color: #d97706; }
    .badge-accurate { background: #dbeafe; color: #2563eb; }
    .badge-inaccurate { background: #fee2e2; color: #dc2626; }
    .depth-bar { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
    .depth-bar-label { font-size: 10px; color: #64748b; width: 90px; flex-shrink: 0; }
    .depth-bar-track { flex: 1; height: 20px; background: #f1f5f9; border-radius: 4px; overflow: hidden; position: relative; }
    .depth-bar-fill { height: 100%; border-radius: 4px; display: flex; align-items: center; justify-content: flex-end; padding-right: 6px; font-size: 9px; font-weight: 700; color: #fff; min-width: 30px; }
    .insight { background: #f8fafc; border-left: 4px solid #3b82f6; padding: 10px 14px; margin-bottom: 8px; border-radius: 0 6px 6px 0; }
    .insight-title { font-size: 11px; font-weight: 700; color: #334155; margin-bottom: 2px; }
    .insight-text { font-size: 10px; color: #64748b; line-height: 1.5; }
    .two-col { display: flex; gap: 16px; margin-bottom: 16px; }
    .two-col > div { flex: 1; }
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

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${brandName}_AI최적화 월간 리포트</title>
<style>${REPORT_CSS}</style></head><body>
<h1>AI최적화 월간 리포트</h1>
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

${monthRuns.map((r) => {
  const items = r.geo_check_items ?? [];
  const st = getRunStats(r);
  return `<div class="section">
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

<div class="footer">frandoor 제공 · ${month} 월간 리포트 · ${brandName}</div>
</body></html>`;

    const w = window.open("", "_blank");
    if (w) {
      w.document.write(html);
      w.document.close();
      const today = new Date().toISOString().slice(2, 10).replace(/-/g, ".");
      w.document.title = `${today} ${brandName}_AI최적화 월간 리포트`;
      setTimeout(() => w.print(), 500);
    }
  };

  const downloadReport = async (run: CheckRun) => {
    const items = run.geo_check_items ?? [];
    const expItems = items.filter(i => i.check_type !== "accuracy");
    const accItems = items.filter(i => i.check_type === "accuracy");
    const expMentioned = expItems.filter(i => i.mentioned).length;
    const expScore = expItems.length > 0 ? Math.round((expMentioned / expItems.length) * 100) : 0;
    const avgAcc = accItems.length > 0 ? Math.round(accItems.reduce((s, i) => s + i.accuracy_score, 0) / accItems.length) : 0;
    const brandName = selectedBrand?.name ?? "";

    // SEO/AEO 최근 결과 로드
    let seoHtml = "";
    let aeoHtml = "";
    let seoScore = -1;
    let aeoScore = -1;
    if (selectedBrand) {
      try {
        const [seoRes, aeoRes] = await Promise.all([
          fetch(`/api/geo/aeo-check?brand_id=${selectedBrand.id}&type=history&platform=naver`),
          fetch(`/api/geo/aeo-check?brand_id=${selectedBrand.id}&type=history&platform=aeo_google`),
        ]);
        if (seoRes.ok) {
          const seoRuns = await seoRes.json();
          if (seoRuns.length > 0) {
            const sr = seoRuns[0];
            seoScore = sr.score ?? 0;
            const seoResults = sr.results ?? [];
            seoHtml = `<div class="section">
              <div class="section-title">SEO 체크 (네이버) — 노출률 ${sr.score}%</div>
              <table class="result-table">
                <thead><tr><th>키워드</th><th style="width:60px">블로그</th><th style="width:60px">웹문서</th><th style="width:50px">순위</th></tr></thead>
                <tbody>${seoResults.map((r: { keyword: string; blog_cited?: boolean; web_cited?: boolean; best_rank?: number }) =>
                  `<tr><td>${r.keyword}</td><td class="center">${r.blog_cited ? "✓" : "✗"}</td><td class="center">${r.web_cited ? "✓" : "✗"}</td><td class="center">${r.best_rank && r.best_rank < 999 ? r.best_rank + "위" : "-"}</td></tr>`
                ).join("")}</tbody>
              </table>
            </div>`;
          }
        }
        if (aeoRes.ok) {
          const aeoRuns = await aeoRes.json();
          if (aeoRuns.length > 0) {
            const ar = aeoRuns[0];
            aeoScore = ar.score ?? 0;
            const aeoResults = ar.results ?? [];
            aeoHtml = `<div class="section">
              <div class="section-title">AEO 체크 (AI 답변 인용) — 인용률 ${ar.score}%</div>
              <table class="result-table">
                <thead><tr><th>키워드</th><th style="width:70px">인용 여부</th><th>인용 도메인</th></tr></thead>
                <tbody>${aeoResults.map((r: { keyword: string; cited?: boolean; our_mentions?: string[] }) =>
                  `<tr><td>${r.keyword}</td><td class="center">${r.cited ? '<span class="badge badge-exposed">인용됨</span>' : '<span class="badge badge-missed">미인용</span>'}</td><td style="font-size:10px">${(r.our_mentions ?? []).join(", ") || "-"}</td></tr>`
                ).join("")}</tbody>
              </table>
            </div>`;
          }
        }
      } catch { /* ignore */ }
    }

    // 해당일 전 30일~해당일까지의 run들 + BEFORE 맨 앞
    const runDate = new Date(run.run_date);
    const d30ago = new Date(runDate); d30ago.setDate(d30ago.getDate() - 30);
    const d30str = d30ago.toISOString().slice(0, 10);
    const latestBefore = [...runs].filter(r => r.model.startsWith("before:")).sort((a, b) => b.run_date.localeCompare(a.run_date))[0] ?? null;
    const recentRegular = [...runs].filter(r => !r.model.startsWith("before:") && r.run_date >= d30str && r.run_date <= run.run_date).reverse();
    const recentRuns = [...(latestBefore ? [latestBefore] : []), ...recentRegular];
    const trendExpData = recentRuns.map(r => getRunStats(r).expScore);
    const trendLabels = recentRuns.map((r, i) => i === 0 && latestBefore ? "BEFORE" : r.run_date.slice(5));

    // 카테고리별 통계
    const reportCategories = getUsedCategories(items);
    const catStats = reportCategories.map(cat => {
      const ci = items.filter(i => (i.category ?? "") === cat);
      const isD3 = cat.startsWith("D3");
      const mentioned = ci.filter(i => i.mentioned).length;
      const score = isD3
        ? (ci.length > 0 ? Math.round(ci.reduce((s, i) => s + i.accuracy_score, 0) / ci.length) : 0)
        : (ci.length > 0 ? Math.round((mentioned / ci.length) * 100) : 0);
      return { cat, label: cat.split(" ")[0], isD3, items: ci, mentioned, total: ci.length, score };
    }).filter(c => c.total > 0);

    // 깊이별 바 차트 SVG
    const depthBarSvg = (() => {
      const barH = 28, gap = 6, W = 340;
      const totalH = catStats.length * (barH + gap);
      const bars = catStats.map((c, i) => {
        const y = i * (barH + gap);
        const color = c.isD3 ? "#3b82f6" : (c.score >= 50 ? "#16a34a" : c.score >= 20 ? "#d97706" : "#ef4444");
        const fillW = Math.max((c.score / 100) * (W - 90), 20);
        return `<g>
          <text x="0" y="${y + 18}" style="font-size:10px;fill:#64748b;font-weight:600">${c.label}</text>
          <rect x="40" y="${y}" width="${W - 90}" height="${barH}" rx="4" fill="#f1f5f9"/>
          <rect x="40" y="${y}" width="${fillW}" height="${barH}" rx="4" fill="${color}" opacity="0.85"/>
          <text x="${40 + fillW - 6}" y="${y + 18}" text-anchor="end" style="font-size:10px;fill:#fff;font-weight:700">${c.score}%</text>
          <text x="${W - 44}" y="${y + 18}" text-anchor="end" style="font-size:9px;fill:#94a3b8">${c.isD3 ? `${c.total}개 평균` : `${c.mentioned}/${c.total}`}</text>
        </g>`;
      }).join("");
      return `<svg viewBox="0 0 ${W} ${totalH}" style="width:100%;max-width:${W}px;height:auto">${bars}</svg>`;
    })();

    // D3 직접노출률 계산
    const d3Items = items.filter(i => (i.category ?? "").startsWith("D3"));
    const d3Score = d3Items.length > 0 ? Math.round(d3Items.reduce((s, i) => s + i.accuracy_score, 0) / d3Items.length) : 0;

    // 인사이트 생성
    const insights = catStats.map(c => {
      const color = c.score >= 50 ? "#16a34a" : c.score >= 20 ? "#d97706" : "#ef4444";
      const dotColor = c.score >= 50 ? "background:#16a34a" : c.score >= 20 ? "background:#d97706" : "background:#ef4444";
      let text = "";
      if (c.isD3) {
        const lowItems = c.items.filter(i => i.accuracy_score < 50);
        text = c.score >= 50
          ? `${brandName} 관련 정보가 비교적 정확하게 제공되고 있습니다.`
          : `${lowItems.length}개 질문에서 부정확한 답변 확인. 콘텐츠 보강 필요.`;
      } else {
        text = c.mentioned > 0
          ? `${c.total}개 질문 중 ${c.mentioned}개에서 ${brandName} 언급.${c.total - c.mentioned > 0 ? ` ${c.total - c.mentioned}개 미노출.` : " 전체 노출 달성."}`
          : `${c.total}개 질문 모두 미노출. GEO 최적화 필요.`;
      }
      return `<div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:6px">
        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;${dotColor};margin-top:4px;flex-shrink:0"></span>
        <div><span style="font-weight:700;color:${color};font-size:11px">${c.label} ${c.isD3 ? "정확도" : "노출률"} ${c.score}%:</span> <span style="font-size:10px;color:#64748b">${text}</span></div>
      </div>`;
    }).join("");

    // 결과 상세 테이블 (브랜드언급 + 내용일치 + 상태)
    const buildResultTable = (catItems: CheckItem[], isD3: boolean) => {
      return catItems.map(item => {
        let statusBadge = "";
        if (isD3) {
          if (item.accuracy_score >= 80) statusBadge = `<span class="badge badge-accurate">정확 인용</span>`;
          else if (item.accuracy_score >= 50) statusBadge = `<span class="badge badge-partial">일부 불일치</span>`;
          else if (item.accuracy_score >= 20) statusBadge = `<span class="badge badge-partial">수치 부정확</span>`;
          else statusBadge = `<span class="badge badge-inaccurate">부정확</span>`;
        } else {
          statusBadge = item.mentioned ? `<span class="badge badge-exposed">노출</span>` : `<span class="badge badge-missed">미노출</span>`;
        }
        const mentionMark = isD3
          ? `<span style="font-weight:600;color:${item.accuracy_score >= 50 ? '#2563eb' : '#dc2626'}">${item.accuracy_score}%</span>`
          : (item.mentioned ? '<span style="color:#16a34a">✓</span>' : '<span style="color:#dc2626">✗</span>');
        const contentMark = isD3
          ? (item.accuracy_score >= 50 ? '<span style="color:#16a34a">✓</span>' : '<span style="color:#d97706">△</span>')
          : "—";
        return `<tr>
          <td class="center" style="width:40px;font-size:9px;color:#94a3b8">${(item.category ?? "").split(" ")[0]}</td>
          <td style="font-size:11px">${item.prompt_text}</td>
          <td class="center" style="width:70px">${mentionMark}</td>
          <td class="center" style="width:70px">${contentMark}</td>
          <td class="center" style="width:80px">${statusBadge}</td>
        </tr>`;
      }).join("");
    };

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${run.run_date.slice(2).replace(/-/g, ".")} ${brandName}_AI최적화 모니터링 리포트</title>
<style>${REPORT_CSS}
  .q-row { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 4px; }
  .q-badge { flex-shrink: 0; margin-top: 8px; }
</style></head><body>

<h1>AI최적화 모니터링 리포트${run.model.startsWith("before:") ? " BEFORE 자료" : ""} <span style="float:right;font-size:12px;background:#f0fdf4;color:#16a34a;padding:4px 12px;border-radius:6px;font-weight:600">${brandName}</span></h1>
<p class="subtitle">${run.run_date} · ${run.model.replace("before:", "")}</p>

<!-- 요약 카드 -->
<div class="summary">
  <div class="summary-card">
    <div class="summary-label">GEO 노출률</div>
    <div class="summary-value ${expScore >= 50 ? 'green' : expScore >= 20 ? 'amber' : 'red'}">${expScore}%</div>
    <div class="summary-detail">AI 챗봇 ${expMentioned}/${expItems.length}</div>
  </div>
  <div class="summary-card">
    <div class="summary-label">GEO 정확도</div>
    <div class="summary-value ${avgAcc >= 50 ? 'blue' : avgAcc >= 20 ? 'amber' : 'red'}">${avgAcc}%</div>
    <div class="summary-detail">D3 ${accItems.length}개 평균</div>
  </div>
  <div class="summary-card">
    <div class="summary-label">SEO 노출률</div>
    <div class="summary-value ${seoScore >= 50 ? 'green' : seoScore >= 20 ? 'amber' : seoScore >= 0 ? 'red' : ''}" style="${seoScore < 0 ? 'color:#94a3b8' : ''}">${seoScore >= 0 ? seoScore + '%' : '-'}</div>
    <div class="summary-detail">${seoScore >= 0 ? '네이버 검색 상위' : '미체크'}</div>
  </div>
  <div class="summary-card">
    <div class="summary-label">AEO 인용률</div>
    <div class="summary-value ${aeoScore >= 50 ? 'green' : aeoScore >= 20 ? 'amber' : aeoScore >= 0 ? 'red' : ''}" style="${aeoScore < 0 ? 'color:#94a3b8' : ''}">${aeoScore >= 0 ? aeoScore + '%' : '-'}</div>
    <div class="summary-detail">${aeoScore >= 0 ? 'AI 답변 인용' : '미체크'}</div>
  </div>
</div>

<!-- 깊이별 노출률 + 추이 그래프 (2단) -->
<div class="two-col">
  <div>
    <div class="section-title">깊이별 노출률 (D0~D3)</div>
    ${depthBarSvg}
  </div>
  <div>
    <div class="section-title">언급률 추이</div>
    ${recentRuns.length > 1 ? svgLineChart(trendExpData, trendLabels, "#16a34a", "브랜드 언급률") : '<p style="font-size:10px;color:#94a3b8;padding:20px 0;text-align:center">추이 데이터 없음 (첫 측정)</p>'}
  </div>
</div>

<!-- FAQ 상세 결과 테이블 -->
<div class="section">
  <div class="section-title">FAQ ${items.length}개 상세 결과</div>
  <table class="result-table">
    <thead>
      <tr><th style="width:40px">뎁스</th><th>질문</th><th style="width:70px">브랜드언급</th><th style="width:70px">내용일치</th><th style="width:80px">상태</th></tr>
    </thead>
    <tbody>
      ${catStats.map(c => `<tr style="background:#f8fafc"><td colspan="5" style="padding:6px 10px;font-size:9px;font-weight:700;color:#64748b;border-top:2px solid #cbd5e1">${c.label} — ${c.isD3 ? "브랜드 직접 질문 → 답변 정확도" : c.label === "D0" ? "일반 창업 질문 → 브랜드 자발적 추천 여부" : c.label === "D1" ? "프랜차이즈 탐색 → 브랜드 추천 여부" : "김밥/분식 카테고리 → 브랜드 노출 여부"}</td></tr>${buildResultTable(c.items, c.isD3)}`).join("")}
    </tbody>
  </table>
</div>

<!-- 이번 주 핵심 인사이트 -->
<div class="section">
  <div class="section-title">핵심 인사이트</div>
  <div style="background:#f8fafc;border-radius:8px;padding:14px 16px">
    ${insights}
  </div>
</div>

<div style="page-break-before:always"></div>
<!-- 상세 Q&A (카테고리별) -->
${reportCategories.map(cat => {
  const catItems = items.filter(i => (i.category ?? "") === cat);
  if (catItems.length === 0) return "";
  const isD3 = cat.startsWith("D3");
  return `<div class="section">
  <div class="section-title">${cat} — ${isD3 ? "정확도 체크" : "노출률 체크"}</div>
  ${catItems.map((item, idx) => {
    const escaped = item.ai_response.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return `<div class="qa">
    <div class="q-row">
      <div style="flex:1"><strong>Q${idx + 1}.</strong> ${item.prompt_text}</div>
      <div class="q-badge">${isD3
        ? `<span class="tag tag-acc">정확도 ${item.accuracy_score}%</span>`
        : item.mentioned
          ? `<span class="tag tag-yes">노출</span>`
          : `<span class="tag tag-no">미노출</span>`}</div>
    </div>
    <div class="a">${escaped}</div>
  </div>`;
  }).join("")}
</div>`;
}).join("")}

${seoHtml}
${aeoHtml}

<div class="footer">
  frandoor 제공 · ${run.run_date} · ${brandName}
</div>
</body></html>`;

    const w = window.open("", "_blank");
    if (w) {
      w.document.write(html);
      w.document.close();
      const d = run.run_date.slice(2).replace(/-/g, ".");
      w.document.title = `${d} ${brandName}_AI최적화 모니터링 리포트`;
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

  const runCheck = async (runType: "regular" | "before" = "regular") => {
    if (!selectedBrand || runningCheck) return;
    setRunningCheck(true);
    setCheckProgress({ current: 0, total: 0, currentQ: "" });

    // 1. run 생성 + 프롬프트 목록 받기
    const createRes = await fetch("/api/geo/check", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brand_id: selectedBrand.id, run_type: runType }),
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
        body: JSON.stringify({ run_id, brand_id: selectedBrand.id, prompt_id: p.id, prompt_text: p.prompt_text, brand_name, category: p.category }),
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

  // 주간 스케줄
  const DAYS = [
    { day: "월", dayEn: "MON", color: "border-blue-300 bg-blue-50", dot: "bg-blue-400", badge: "bg-blue-600" },
    { day: "화", dayEn: "TUE", color: "border-purple-300 bg-purple-50", dot: "bg-purple-400", badge: "bg-purple-600" },
    { day: "수", dayEn: "WED", color: "border-orange-300 bg-orange-50", dot: "bg-orange-400", badge: "bg-orange-600" },
    { day: "목", dayEn: "THU", color: "border-emerald-300 bg-emerald-50", dot: "bg-emerald-400", badge: "bg-emerald-600" },
    { day: "금", dayEn: "FRI", color: "border-slate-300 bg-slate-50", dot: "bg-slate-400", badge: "bg-slate-600" },
  ];
  const DEFAULT_TASKS: Record<string, string[]> = {
    "월": ["GEO 체크", "블로그 티스토리 발행", "SEO 모니터링"],
    "화": ["GEO 체크", "블로그 네이버 발행", "SEO 모니터링"],
    "수": ["GEO 체크", "블로그 frandoor 발행", "SEO 모니터링"],
    "목": ["GEO 체크", "블로그 발행", "SEO 모니터링"],
    "금": ["GEO 체크", "블로그 발행", "SEO 모니터링"],
  };
  type WeeklyData = Record<string, string[]>;
  const [weeklyBrands, setWeeklyBrands] = useState<WeeklyData>(() => {
    if (typeof window === "undefined") return { "월": ["오공김밥"], "화": ["한신우동"], "수": ["덮밥장사장"], "목": [], "금": [] };
    try {
      const saved = JSON.parse(localStorage.getItem("frandoor-weekly-v2") ?? "null");
      if (saved && typeof saved === "object" && Array.isArray(saved["월"])) return saved;
    } catch { /* ignore */ }
    return { "월": ["오공김밥"], "화": ["한신우동"], "수": ["덮밥장사장"], "목": [], "금": [] };
  });
  const [editBrandTarget, setEditBrandTarget] = useState<Brand | null>(null);
  const [scheduleAddDay, setScheduleAddDay] = useState<string | null>(null);
  const [dragBrand, setDragBrand] = useState<{ name: string; fromDay: string } | null>(null);
  const todayDayIndex = new Date().getDay();
  const todayScheduleIndex = todayDayIndex >= 1 && todayDayIndex <= 5 ? todayDayIndex - 1 : -1;

  const saveWeekly = (next: WeeklyData) => {
    setWeeklyBrands(next);
    localStorage.setItem("frandoor-weekly-v2", JSON.stringify(next));
  };
  const removeBrandFromDay = (day: string, brandName: string) => {
    const next = { ...weeklyBrands, [day]: (weeklyBrands[day] ?? []).filter(b => b !== brandName) };
    saveWeekly(next);
  };
  const addBrandToDay = (day: string, brandName: string) => {
    if ((weeklyBrands[day] ?? []).includes(brandName)) return;
    const next = { ...weeklyBrands, [day]: [...(weeklyBrands[day] ?? []), brandName] };
    saveWeekly(next);
  };
  const moveBrand = (fromDay: string, toDay: string, brandName: string) => {
    if (fromDay === toDay) return;
    const next = {
      ...weeklyBrands,
      [fromDay]: (weeklyBrands[fromDay] ?? []).filter(b => b !== brandName),
      [toDay]: [...(weeklyBrands[toDay] ?? []).filter(b => b !== brandName), brandName],
    };
    saveWeekly(next);
  };

  // 브랜드 목록 + 주간 대시보드
  if (!selectedBrand) {
    return (
      <div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Frandoor 대시보드</h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">AI 최적화 모니터링 · 콘텐츠 생성 · 주간 운영</p>
          </div>
          <div className="flex gap-2">
            <a href="/frandoor/demo" className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 transition-colors">
              🎯 GEO 시연
            </a>
            <Button onClick={() => setAddBrandOpen(true)} className="flex-1 sm:flex-none"><Plus className="h-4 w-4 mr-1" />브랜드 추가</Button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-16 text-slate-400 text-sm">불러오는 중...</div>
        ) : (
          <>
            {/* 주간 스케줄 */}
            <div className="mb-6">
              <h2 className="text-sm font-semibold text-slate-700 mb-3">
                <Sparkles className="h-4 w-4 inline mr-1" />주간 운영 스케줄
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
                {DAYS.map((d, i) => {
                  const isToday = i === todayScheduleIndex;
                  const dayBrands = weeklyBrands[d.day] ?? [];
                  const tasks = DEFAULT_TASKS[d.day] ?? [];
                  return (
                    <div key={i}
                      className={cn("rounded-xl border p-3 transition-all lg:min-h-[200px]", isToday ? d.color + " shadow-sm" : "border-slate-200 bg-white")}
                      onDragOver={e => e.preventDefault()}
                      onDrop={() => { if (dragBrand) { moveBrand(dragBrand.fromDay, d.day, dragBrand.name); setDragBrand(null); } }}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1.5">
                          <span className={cn("text-xs font-bold px-2 py-0.5 rounded text-white", isToday ? d.badge : "bg-slate-400")}>{d.day}</span>
                          {isToday && <span className="text-[9px] text-emerald-600 font-medium">TODAY</span>}
                        </div>
                        <span className="text-[10px] text-slate-400">{d.dayEn}</span>
                      </div>

                      {/* 브랜드 카드들 */}
                      <div className="space-y-1.5">
                        {dayBrands.map(bName => {
                          const matchedBrand = brands.find(b => b.name === bName);
                          const allRuns = matchedBrand?.geo_check_runs ?? [];
                          const regularRun = allRuns.find(r => !r.run_date.startsWith("before:") && !(matchedBrand?.geo_check_runs ?? []).some(br => br.id === r.id && (br as unknown as { model?: string }).model?.startsWith("before:")));
                          const beforeRun = allRuns.find(r => (r as unknown as { model?: string }).model?.startsWith("before:"));
                          const latestRun = regularRun ?? beforeRun;
                          const score = latestRun?.score ?? null;
                          const isBefore = !regularRun && !!beforeRun;
                          return (
                            <div key={bName}
                              draggable
                              onDragStart={() => setDragBrand({ name: bName, fromDay: d.day })}
                              onDragEnd={() => setDragBrand(null)}
                              className="group bg-white border border-slate-200 rounded-lg p-2 cursor-grab active:cursor-grabbing hover:shadow-sm transition-shadow">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-slate-700 truncate">{bName}</span>
                                <div className="flex items-center gap-0.5 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                                  {matchedBrand && (
                                    <button onClick={() => setEditBrandTarget(matchedBrand)} className="p-1 rounded hover:bg-slate-100 text-slate-400">
                                      <FileText className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                  <button onClick={() => removeBrandFromDay(d.day, bName)} className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                              {/* 자동화 상태 + 플랜 태스크 */}
                              {matchedBrand && (() => {
                                const plan = getBrandPlan(matchedBrand);
                                const activeTasks = PLAN_LABELS.filter(p => plan[p.key]);
                                return (
                                  <>
                                    <div className="flex items-center justify-between mt-1">
                                      <span className={cn("text-[8px] font-medium", plan.auto_enabled ? "text-emerald-600" : "text-slate-400")}>
                                        {plan.auto_enabled ? `자동 ${plan.auto_time ?? "09:00"}` : "자동 OFF"}
                                      </span>
                                      <button onClick={async (e) => {
                                        e.stopPropagation();
                                        const newPlan = { ...plan, auto_enabled: !plan.auto_enabled };
                                        const fd = (matchedBrand.fact_data && Array.isArray(matchedBrand.fact_data))
                                          ? matchedBrand.fact_data.filter((dd: { label: string }) => dd.label !== "__brand_plan__")
                                          : [];
                                        const newFd = [...fd, { keyword: JSON.stringify(newPlan), label: "__brand_plan__" }];
                                        await fetch("/api/geo/brands", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: matchedBrand.id, fact_data: newFd }) });
                                        setBrands(prev => prev.map(bb => bb.id === matchedBrand.id ? { ...bb, fact_data: newFd as Brand["fact_data"] } : bb));
                                      }} className={cn("w-7 h-4 rounded-full relative transition-colors", plan.auto_enabled ? "bg-emerald-500" : "bg-slate-300")}>
                                        <div className={cn("absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform", plan.auto_enabled ? "translate-x-3.5" : "translate-x-0.5")} />
                                      </button>
                                    </div>
                                    {activeTasks.length > 0 && (
                                      <div className="flex flex-wrap gap-0.5 mt-1">
                                        {activeTasks.map(t => (
                                          <span key={t.key} className="text-[8px] px-1 py-0.5 rounded bg-slate-100 text-slate-500">{t.label}</span>
                                        ))}
                                      </div>
                                    )}
                                  </>
                                );
                              })()}
                              {score !== null && (
                                <div className="flex items-center gap-1 mt-1">
                                  {isBefore ? (
                                    <>
                                      <span className={cn("text-[10px] font-bold", score >= 50 ? "text-emerald-600" : score >= 20 ? "text-amber-500" : "text-red-500")}>{score}%</span>
                                      <span className="text-[9px] text-amber-500">(BEFORE)</span>
                                    </>
                                  ) : beforeRun && regularRun ? (
                                    <>
                                      <span className="text-[9px] text-slate-400 line-through">{beforeRun.score}%</span>
                                      <span className="text-[9px] text-slate-400">→</span>
                                      <span className={cn("text-[10px] font-bold", score >= 50 ? "text-emerald-600" : score >= 20 ? "text-amber-500" : "text-red-500")}>{score}%</span>
                                      <span className="text-[9px] text-slate-400">GEO</span>
                                    </>
                                  ) : (
                                    <>
                                      <span className={cn("text-[10px] font-bold", score >= 50 ? "text-emerald-600" : score >= 20 ? "text-amber-500" : "text-red-500")}>{score}%</span>
                                      <span className="text-[9px] text-slate-400">GEO</span>
                                    </>
                                  )}
                                </div>
                              )}
                              {matchedBrand && (
                                <button onClick={() => selectBrand(matchedBrand)} className="mt-1 w-full text-[9px] py-1 rounded border border-slate-200 text-slate-500 hover:bg-slate-50">진입 →</button>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* 브랜드 추가 버튼 */}
                      <button onClick={() => setScheduleAddDay(d.day)}
                        className="mt-2 w-full text-[10px] py-1.5 rounded-lg border border-dashed border-slate-300 text-slate-400 hover:border-slate-400 hover:text-slate-600 transition-colors">
                        <Plus className="h-3 w-3 inline mr-0.5" />추가
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* 요일에 브랜드 추가 모달 */}
              {scheduleAddDay && (
                <Dialog open onOpenChange={() => setScheduleAddDay(null)}>
                  <DialogContent className="max-w-xs">
                    <DialogHeader><DialogTitle>{scheduleAddDay}요일에 브랜드 추가</DialogTitle></DialogHeader>
                    <div className="space-y-1 py-2">
                      {brands.filter(b => !(weeklyBrands[scheduleAddDay!] ?? []).includes(b.name)).map(b => (
                        <button key={b.id} onClick={() => { addBrandToDay(scheduleAddDay!, b.name); setScheduleAddDay(null); }}
                          className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-slate-50 border border-slate-200">
                          {b.name}
                        </button>
                      ))}
                      {brands.filter(b => !(weeklyBrands[scheduleAddDay!] ?? []).includes(b.name)).length === 0 && (
                        <p className="text-xs text-slate-400 text-center py-4">추가할 브랜드가 없습니다</p>
                      )}
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </div>

            {/* 브랜드 카드 */}
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-slate-700 mb-3">브랜드 현황</h2>
            </div>
            {brands.length === 0 ? (
              <div className="text-center py-16">
                <Bot className="h-12 w-12 text-slate-200 mx-auto mb-3" />
                <p className="text-sm text-slate-400">브랜드를 추가하세요</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {brands.map(brand => {
                  const bRuns = brand.geo_check_runs ?? [];
                  const bRegular = bRuns.find(r => !(r as unknown as { model?: string }).model?.startsWith("before:"));
                  const bBefore = bRuns.find(r => (r as unknown as { model?: string }).model?.startsWith("before:"));
                  const latestRun = bRegular ?? bBefore;
                  const score = latestRun?.score ?? null;
                  const bIsBefore = !bRegular && !!bBefore;
                  const assignedDay = DAYS.find(d => (weeklyBrands[d.day] ?? []).includes(brand.name));
                  return (
                    <div key={brand.id}
                      className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md hover:border-blue-200 transition-all group">
                      <div className="flex items-start justify-between mb-2">
                        <div className="cursor-pointer flex-1" onClick={() => selectBrand(brand)}>
                          <h3 className="font-semibold text-slate-800 group-hover:text-blue-600">{brand.name}</h3>
                          {assignedDay && <span className="text-[10px] text-slate-400">매주 {assignedDay.day}요일</span>}
                        </div>
                        <div className="flex items-center gap-1">
                          <button onClick={(e) => { e.stopPropagation(); setEditBrandTarget(brand); }} className="opacity-100 lg:opacity-0 lg:group-hover:opacity-100 p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600">
                            <FileText className="h-4 w-4" />
                          </button>
                          <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-blue-400 cursor-pointer" onClick={() => selectBrand(brand)} />
                        </div>
                      </div>
                      {brand.landing_url && <p className="text-xs text-slate-400 truncate mb-3">{brand.landing_url}</p>}
                      {score !== null ? (
                        <div className="flex items-center gap-3">
                          {bIsBefore ? (
                            <>
                              <div className={cn("text-2xl font-bold", score >= 50 ? "text-emerald-600" : score >= 20 ? "text-amber-500" : "text-red-500")}>
                                {score}%
                              </div>
                              <div className="text-xs text-slate-400">
                                <p className="text-amber-500 font-medium">BEFORE</p>
                                <p>{latestRun!.mentioned_count}/{latestRun!.total_prompts} 프롬프트</p>
                              </div>
                            </>
                          ) : bBefore && bRegular ? (
                            <>
                              <div className={cn("text-2xl font-bold", score >= 50 ? "text-emerald-600" : score >= 20 ? "text-amber-500" : "text-red-500")}>
                                {score}%
                              </div>
                              <div className="text-xs text-slate-400">
                                <p>AI 노출률 <span className="text-slate-300 line-through">{bBefore.score}%</span> → <span className={cn("font-medium", score > bBefore.score ? "text-emerald-500" : score < bBefore.score ? "text-red-500" : "text-slate-500")}>{score}%</span></p>
                                <p>{latestRun!.mentioned_count}/{latestRun!.total_prompts} 프롬프트</p>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className={cn("text-2xl font-bold", score >= 50 ? "text-emerald-600" : score >= 20 ? "text-amber-500" : "text-red-500")}>
                                {score}%
                              </div>
                              <div className="text-xs text-slate-400">
                                <p>AI 노출률</p>
                                <p>{latestRun!.mentioned_count}/{latestRun!.total_prompts} 프롬프트</p>
                              </div>
                            </>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400">아직 체크 안 됨</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        <AddBrandModal open={addBrandOpen} onClose={() => setAddBrandOpen(false)} onCreated={(b, selectedDay) => {
          setBrands(prev => [b, ...prev]);
          if (selectedDay) addBrandToDay(selectedDay, b.name);
          setAddBrandOpen(false);
        }} />

        {/* 브랜드 수정 모달 */}
        {editBrandTarget && (
          <EditBrandModal brand={editBrandTarget} onClose={() => setEditBrandTarget(null)} onSaved={(updated) => {
            setBrands(prev => prev.map(b => b.id === updated.id ? { ...b, ...updated } : b));
            setEditBrandTarget(null);
          }} />
        )}
      </div>
    );
  }

  // 브랜드 상세
  const exposurePromptCount = prompts.filter(p => !p.category?.startsWith("D3")).length;
  const accuracyPromptCount = prompts.filter(p => p.category?.startsWith("D3")).length;

  // 프롬프트/아이템에서 실제 사용되는 카테고리명 동적 추출
  const getUsedCategories = (source: { category?: string }[]) => {
    const cats = [...new Set(source.map(p => p.category ?? "").filter(Boolean))];
    const sorted = ["D0", "D1", "D2", "D3"].flatMap(d => cats.filter(c => c.startsWith(d)));
    return sorted.length > 0 ? sorted : ["D0 개인창업 탐색", "D1 프랜차이즈 탐색", "D2 카테고리", "D3 브랜드 직접"];
  };
  const promptCategories = getUsedCategories(prompts);

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
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between mb-6">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => setSelectedBrand(null)} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 shrink-0">
            <ChevronRight className="h-5 w-5 rotate-180" />
          </button>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 truncate">{selectedBrand.name}</h1>
            {selectedBrand.landing_url && <p className="text-xs text-slate-400 truncate">{selectedBrand.landing_url}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* 자동 진행 토글 */}
          {(() => {
            const plan = getBrandPlan(selectedBrand);
            return (
              <div className="flex items-center gap-1.5 mr-2">
                <span className={cn("text-xs font-medium", plan.auto_enabled ? "text-emerald-600" : "text-slate-400")}>
                  {plan.auto_enabled ? "자동 ON" : "자동 OFF"}
                </span>
                <button onClick={async () => {
                  const newPlan = { ...plan, auto_enabled: !plan.auto_enabled };
                  const fd = (selectedBrand.fact_data && Array.isArray(selectedBrand.fact_data))
                    ? selectedBrand.fact_data.filter((dd: { label: string }) => dd.label !== "__brand_plan__")
                    : [];
                  const newFd = [...fd, { keyword: JSON.stringify(newPlan), label: "__brand_plan__" }];
                  await fetch("/api/geo/brands", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: selectedBrand.id, fact_data: newFd }) });
                  setSelectedBrand({ ...selectedBrand, fact_data: newFd as Brand["fact_data"] });
                  setBrands(prev => prev.map(bb => bb.id === selectedBrand.id ? { ...bb, fact_data: newFd as Brand["fact_data"] } : bb));
                }} className={cn("w-9 h-5 rounded-full relative transition-colors", plan.auto_enabled ? "bg-emerald-500" : "bg-slate-300")}>
                  <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform", plan.auto_enabled ? "translate-x-4.5" : "translate-x-0.5")} />
                </button>
              </div>
            );
          })()}
          <Button variant="outline" size="sm" onClick={() => setAddPromptOpen(true)}><Plus className="h-4 w-4 mr-1" /><span className="hidden sm:inline">프롬프트 관리</span><span className="sm:hidden">프롬프트</span></Button>
          {regularRuns.length > 0 && <Button variant="outline" size="sm" onClick={() => setMonthlyReportOpen(true)}><Download className="h-4 w-4 mr-1" /><span className="hidden sm:inline">월간 리포트</span><span className="sm:hidden">월간</span></Button>}
          <Button size="sm" onClick={() => runCheck(checkTab)} disabled={runningCheck || prompts.length === 0}>
            {runningCheck ? (
              <><span className="animate-spin mr-1">⏳</span>{checkProgress.current}/{checkProgress.total}</>
            ) : checkTab === "before" ? (
              <><Play className="h-4 w-4 mr-1" />BEFORE 체크</>
            ) : (
              <><Play className="h-4 w-4 mr-1" />GEO 체크 실행</>
            )}
          </Button>
        </div>
      </div>

      {/* 상위 탭 */}
      <div className="flex items-center gap-1 mb-4 border-b border-slate-200 overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
        <button onClick={() => setMainTab("check")}
          className={cn("px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0",
            mainTab === "check" ? "border-slate-900 text-slate-900" : "border-transparent text-slate-400 hover:text-slate-600"
          )}>GEO 체크</button>
        <button onClick={async () => {
          setMainTab("seo");
          if (selectedBrand) {
            if (aeoKeywords.length === 0) {
              try { const res = await fetch(`/api/geo/aeo-check?brand_id=${selectedBrand.id}`); if (res.ok) setAeoKeywords(await res.json()); } catch { /* ignore */ }
            }
            // 최근 SEO 결과 로드
            if (!aeoResults) {
              try {
                const res = await fetch(`/api/geo/aeo-check?brand_id=${selectedBrand.id}&type=history&platform=${aeoPlatform}`);
                if (res.ok) {
                  const runs = await res.json();
                  if (runs.length > 0 && runs[0].results) {
                    setAeoResults(runs[0].results);
                    setAeoScore({ cited_count: runs[0].cited_count, total: runs[0].total_keywords, score: runs[0].score });
                  }
                }
              } catch { /* ignore */ }
            }
          }
        }}
          className={cn("px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0",
            mainTab === "seo" ? "border-emerald-500 text-emerald-600" : "border-transparent text-slate-400 hover:text-slate-600"
          )}><Search className="h-3.5 w-3.5 inline mr-1" />SEO 체크</button>
        <button onClick={async () => {
          setMainTab("aeo");
          if (selectedBrand) {
            if (aeoKeywords.length === 0) {
              try { const res = await fetch(`/api/geo/aeo-check?brand_id=${selectedBrand.id}`); if (res.ok) setAeoKeywords(await res.json()); } catch { /* ignore */ }
            }
            // AEO 체크 기록 로드
            try {
              const res = await fetch(`/api/geo/aeo-check?brand_id=${selectedBrand.id}&type=history&platform=aeo_${aeoAiPlatform}`);
              if (res.ok) {
                const runs = await res.json();
                setAeoAiRuns(runs);
                if (!aeoAiSelectedRun && runs.length > 0 && runs[0].results) {
                  setAeoAiSelectedRun(runs[0]);
                  setAeoAiResults(runs[0].results);
                  setAeoAiScore({ cited_count: runs[0].cited_count, total: runs[0].total_keywords, score: runs[0].score });
                }
              }
            } catch { /* ignore */ }
          }
        }}
          className={cn("px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0",
            mainTab === "aeo" ? "border-purple-500 text-purple-600" : "border-transparent text-slate-400 hover:text-slate-600"
          )}><Bot className="h-3.5 w-3.5 inline mr-1" />AEO 체크</button>
        <button onClick={() => {
          setMainTab("blog");
          if (selectedBrand) {
            if (selectedBrand?.fact_data && Array.isArray(selectedBrand.fact_data)) {
              const refEntry = selectedBrand.fact_data.find((d: { label: string }) => d.label === "__blog_ref_links__");
              if (refEntry) {
                try { const links = JSON.parse((refEntry as { keyword: string }).keyword); const padded = [...links, "", "", "", "", ""].slice(0, 5); setBlogRefLinks(padded); } catch { setBlogRefLinks(["", "", "", "", ""]); }
              } else { setBlogRefLinks(["", "", "", "", ""]); }
            } else { setBlogRefLinks(["", "", "", "", ""]); }
          }
        }}
          className={cn("px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0",
            mainTab === "blog" ? "border-violet-500 text-violet-600" : "border-transparent text-slate-400 hover:text-slate-600"
          )}><FileText className="h-3.5 w-3.5 inline mr-1" />블로그 작성</button>
        {mainTab === "check" && <>
          <div className="w-px h-4 bg-slate-200 mx-1 shrink-0" />
          <button onClick={() => { setCheckTab("regular"); setRunPage(0); }}
            className={cn("px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap shrink-0",
              checkTab === "regular" ? "border-slate-600 text-slate-700" : "border-transparent text-slate-400 hover:text-slate-600"
            )}>체크기록</button>
          <button onClick={() => { setCheckTab("before"); setRunPage(0); }}
            className={cn("px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap shrink-0",
              checkTab === "before" ? "border-amber-500 text-amber-600" : "border-transparent text-slate-400 hover:text-slate-600"
            )}>BEFORE</button>
        </>}
        <span className="hidden lg:block ml-auto text-[10px] text-slate-400 whitespace-nowrap">
          {mainTab === "seo" ? "네이버 검색 노출 순위 모니터링" : mainTab === "aeo" ? "AI 답변(AI Overview·CLOVA X) 인용 여부 체크" : mainTab === "blog" ? "SEO·AEO·GEO 최적화 콘텐츠 생성" : checkTab === "before" ? "서비스 이용 전 현황 기록용" : "정기 모니터링 기록"}
        </span>
      </div>

      {/* 블로그 작성 탭 */}
      {/* SEO 체크 탭 */}
      {mainTab === "seo" && (
        <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
          {/* 좌측: 키워드 관리 (상시) */}
          <div className="w-full lg:w-64 lg:shrink-0 space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-slate-700 mb-2">
                <Search className="h-4 w-4 inline mr-1" />모니터링 키워드
              </h2>
              <div className="flex gap-1 mb-2">
                <Input value={aeoNewKeyword} onChange={e => setAeoNewKeyword(e.target.value)}
                  className="text-xs h-7" placeholder="키워드 입력"
                  onKeyDown={async e => {
                    if (e.key !== "Enter" || !aeoNewKeyword.trim() || !selectedBrand) return;
                    const res = await fetch("/api/geo/aeo-check", {
                      method: "POST", headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "add_keyword", brand_id: selectedBrand.id, keyword: aeoNewKeyword.trim() }),
                    });
                    if (res.ok) { const kw = await res.json(); setAeoKeywords(prev => [...prev, kw]); setAeoNewKeyword(""); }
                    else { const err = await res.json(); alert(err.error); }
                  }} />
                <Button variant="outline" size="sm" className="h-7 px-1.5" onClick={async () => {
                  if (!aeoNewKeyword.trim() || !selectedBrand) return;
                  const res = await fetch("/api/geo/aeo-check", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "add_keyword", brand_id: selectedBrand.id, keyword: aeoNewKeyword.trim() }),
                  });
                  if (res.ok) { const kw = await res.json(); setAeoKeywords(prev => [...prev, kw]); setAeoNewKeyword(""); }
                  else { const err = await res.json(); alert(err.error); }
                }}><Plus className="h-3 w-3" /></Button>
              </div>
              <div className="space-y-0.5 max-h-[400px] overflow-y-auto">
                {aeoKeywords.map(kw => (
                  <div key={kw.id} className="flex items-center justify-between py-1.5 px-1.5 rounded hover:bg-slate-50 group text-xs">
                    <span className="text-slate-700 truncate flex-1">{kw.keyword}</span>
                    <button onClick={async () => {
                      await fetch(`/api/geo/aeo-check?id=${kw.id}`, { method: "DELETE" });
                      setAeoKeywords(prev => prev.filter(k => k.id !== kw.id));
                    }} className="opacity-100 lg:opacity-0 lg:group-hover:opacity-100 text-red-400 hover:text-red-600 ml-1 p-1"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
                {aeoKeywords.length === 0 && <p className="text-[10px] text-slate-400 py-2 text-center">키워드를 등록하세요</p>}
              </div>
              <p className="text-[10px] text-slate-400 mt-2">{aeoKeywords.length}개 등록</p>
            </div>

            {/* 플랫폼 + 체크 실행 */}
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex gap-2 mb-2">
                <button onClick={() => setAeoPlatform("naver")}
                  className={cn("flex-1 text-xs py-1.5 rounded-lg border transition-colors",
                    aeoPlatform === "naver" ? "bg-green-50 border-green-300 text-green-700 font-semibold" : "border-slate-200 text-slate-500"
                  )}>네이버</button>
                <button onClick={() => setAeoPlatform("google")}
                  className={cn("flex-1 text-xs py-1.5 rounded-lg border transition-colors",
                    aeoPlatform === "google" ? "bg-blue-50 border-blue-300 text-blue-700 font-semibold" : "border-slate-200 text-slate-500"
                  )}>구글</button>
              </div>
              <Button className="w-full mb-2" size="sm" onClick={async () => {
                if (!selectedBrand || aeoKeywords.length === 0 || aeoRunning) return;
                setAeoRunning(true); setAeoResults(null); setAeoScore(null);
                try {
                  const res = await fetch("/api/geo/aeo-check", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "run_check", brand_id: selectedBrand.id, platform: aeoPlatform }),
                  });
                  const data = await res.json();
                  if (data.results) {
                    setAeoResults(data.results);
                    setAeoScore({ cited_count: data.cited_count, total: data.total_keywords, score: data.score });
                  } else { alert(data.error || "체크 실패"); }
                } catch { alert("체크 실패"); }
                setAeoRunning(false);
              }} disabled={aeoRunning || aeoKeywords.length === 0}>
                {aeoRunning ? <><span className="animate-spin mr-1">⏳</span>체크 중...</> : <><Search className="h-4 w-4 mr-1" />{aeoPlatform === "naver" ? "네이버" : "구글"} SEO 체크</>}
              </Button>
              <p className="text-[10px] text-slate-400 text-center">{aeoPlatform === "naver" ? "네이버 블로그 + 웹문서" : "구글 웹 검색"} 상위 노출 확인</p>
            </div>

            {/* 설명 */}
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-xs font-semibold text-slate-600 mb-1.5">체크 항목</h3>
              <div className="space-y-1 text-[10px] text-slate-500">
                <div className="flex items-center gap-1.5"><CheckCircle2 className="h-2.5 w-2.5 text-green-500 shrink-0" />네이버 블로그 상위 10위</div>
                <div className="flex items-center gap-1.5"><CheckCircle2 className="h-2.5 w-2.5 text-green-500 shrink-0" />네이버 웹문서 상위 10위</div>
                <div className="flex items-center gap-1.5"><CheckCircle2 className="h-2.5 w-2.5 text-green-500 shrink-0" />frandoor.co.kr 노출 여부</div>
                <div className="flex items-center gap-1.5"><CheckCircle2 className="h-2.5 w-2.5 text-green-500 shrink-0" />브랜드 사이트 노출 여부</div>
              </div>
            </div>
          </div>

          {/* 우측: 체크 결과 */}
          <div className="flex-1 min-w-0 space-y-4">
            {aeoScore && (
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                <div className="bg-white rounded-xl border border-slate-200 p-3 sm:p-4 text-center">
                  <p className="text-[10px] text-slate-400 uppercase">노출률</p>
                  <p className={cn("text-xl sm:text-2xl font-bold mt-1", aeoScore.score >= 50 ? "text-emerald-600" : aeoScore.score >= 20 ? "text-amber-500" : "text-red-500")}>{aeoScore.score}%</p>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-3 sm:p-4 text-center">
                  <p className="text-[10px] text-slate-400 uppercase">노출 키워드</p>
                  <p className="text-xl sm:text-2xl font-bold text-emerald-600 mt-1">{aeoScore.cited_count}<span className="text-sm text-slate-400">/{aeoScore.total}</span></p>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-3 sm:p-4 text-center">
                  <p className="text-[10px] text-slate-400 uppercase">플랫폼</p>
                  <p className="text-base sm:text-lg font-bold text-green-600 mt-1">{aeoPlatform === "naver" ? "Naver" : "Google"}</p>
                </div>
              </div>
            )}

            {aeoResults ? (
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <h3 className="text-sm font-semibold text-slate-700 mb-3">키워드별 {aeoPlatform === "naver" ? "네이버" : "구글"} 노출 결과</h3>
                <div className="space-y-3">
                  {aeoResults.map((r, i) => {
                    const a = r as Record<string, unknown>;
                    const blogCited = (a.blog_cited ?? a.naver_blog_cited ?? false) as boolean;
                    const webCited = (a.web_cited ?? a.naver_web_cited ?? false) as boolean;
                    const bestRank = (a.best_rank ?? a.naver_best_rank ?? 999) as number;
                    const blogResults = (a.blog_results ?? a.naver_blog_results ?? []) as AeoResult["blog_results"];
                    const webResults = (a.web_results ?? a.naver_web_results ?? []) as AeoResult["web_results"];
                    const ourUrls = (a.our_urls ?? a.naver_our_urls ?? []) as string[];
                    return (
                    <div key={i} className="border border-slate-200 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-slate-700">{r.keyword}</span>
                        <div className="flex gap-1">
                          {blogCited && <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-50 text-green-600 font-medium">{aeoPlatform === "naver" ? "블로그" : ""} 노출</span>}
                          {webCited && <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-medium">{aeoPlatform === "naver" ? "웹문서" : "구글"} 노출</span>}
                          {!blogCited && !webCited && <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-50 text-red-500 font-medium">미노출</span>}
                          {bestRank < 999 && <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 font-medium">{bestRank}위</span>}
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {/* 블로그 결과 */}
                        <div>
                          <p className="text-[9px] text-slate-400 font-semibold mb-1">{aeoPlatform === "naver" ? "블로그 TOP 5" : ""}</p>
                          {blogResults.slice(0, 5).map((b, j) => (
                            <div key={j} className={cn("flex items-start gap-1 py-0.5", b.is_ours && "bg-emerald-50 -mx-1 px-1 rounded")}>
                              <span className="text-[9px] text-slate-400 w-3 shrink-0">{b.rank}</span>
                              <a href={b.link} target="_blank" rel="noreferrer" className={cn("text-[10px] truncate hover:underline", b.is_ours ? "text-emerald-600 font-medium" : "text-slate-600")}>
                                {b.is_ours && "★ "}{b.title}
                              </a>
                            </div>
                          ))}
                        </div>
                        {/* 웹문서 결과 */}
                        <div>
                          <p className="text-[9px] text-slate-400 font-semibold mb-1">{aeoPlatform === "naver" ? "웹문서 TOP 5" : "구글 검색 TOP 10"}</p>
                          {webResults.slice(0, 5).map((w, j) => (
                            <div key={j} className={cn("flex items-start gap-1 py-0.5", w.is_ours && "bg-emerald-50 -mx-1 px-1 rounded")}>
                              <span className="text-[9px] text-slate-400 w-3 shrink-0">{w.rank}</span>
                              <a href={w.link} target="_blank" rel="noreferrer" className={cn("text-[10px] truncate hover:underline", w.is_ours ? "text-emerald-600 font-medium" : "text-slate-600")}>
                                {w.is_ours && "★ "}{w.title}
                              </a>
                            </div>
                          ))}
                        </div>
                      </div>
                      {ourUrls.length > 0 && (
                        <div className="mt-1.5 pt-1.5 border-t border-slate-100">
                          <p className="text-[9px] text-emerald-600 font-medium">우리 콘텐츠: {ourUrls.map(u => u.replace(/https?:\/\//, "").slice(0, 35)).join(", ")}</p>
                        </div>
                      )}
                    </div>
                    );
                  })}
                </div>
              </div>
            ) : aeoRunning ? (
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-8 text-center">
                <p className="text-sm text-blue-700 animate-pulse">네이버 검색 중... ({aeoKeywords.length}개 키워드)</p>
                <p className="text-xs text-blue-500 mt-1">블로그 + 웹문서 검색 결과 분석 중</p>
              </div>
            ) : (
              <div className="text-center py-20">
                <Search className="h-14 w-14 text-slate-200 mx-auto mb-4" />
                <p className="text-sm text-slate-400">좌측에서 키워드를 등록하고 AEO 체크를 실행하세요</p>
                <p className="text-xs text-slate-300 mt-1">네이버 블로그·웹문서 검색 결과에서 우리 콘텐츠 노출 순위를 확인합니다</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* AEO 체크 탭 */}
      {mainTab === "aeo" && (
        <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
          {/* 좌측: 키워드 (SEO와 공유) */}
          <div className="w-full lg:w-64 lg:shrink-0 space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-slate-700 mb-2">
                <Bot className="h-4 w-4 inline mr-1" />모니터링 키워드
              </h2>
              <p className="text-[10px] text-slate-400 mb-2">SEO 체크와 동일 키워드 사용</p>
              <div className="space-y-0.5 max-h-[400px] overflow-y-auto">
                {aeoKeywords.map(kw => (
                  <div key={kw.id} className="py-1 px-1.5 text-xs text-slate-700 truncate">{kw.keyword}</div>
                ))}
                {aeoKeywords.length === 0 && <p className="text-[10px] text-slate-400 py-2 text-center">SEO 체크 탭에서 키워드를 등록하세요</p>}
              </div>
              <p className="text-[10px] text-slate-400 mt-2">{aeoKeywords.length}개 등록</p>
            </div>

            {/* 플랫폼 + 실행 */}
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex gap-2 mb-2">
                <button onClick={() => setAeoAiPlatform("google")}
                  className={cn("flex-1 text-xs py-1.5 rounded-lg border transition-colors",
                    aeoAiPlatform === "google" ? "bg-blue-50 border-blue-300 text-blue-700 font-semibold" : "border-slate-200 text-slate-500"
                  )}>Google AI</button>
                <button onClick={() => setAeoAiPlatform("naver")}
                  className={cn("flex-1 text-xs py-1.5 rounded-lg border transition-colors",
                    aeoAiPlatform === "naver" ? "bg-green-50 border-green-300 text-green-700 font-semibold" : "border-slate-200 text-slate-500"
                  )}>네이버 AI</button>
              </div>
              <Button className="w-full" size="sm" onClick={async () => {
                if (!selectedBrand || aeoKeywords.length === 0 || aeoAiRunning) return;
                setAeoAiRunning(true); setAeoAiResults(null); setAeoAiScore(null); setAeoAiSelectedRun(null);
                try {
                  const res = await fetch("/api/geo/aeo-ai-check", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ brand_id: selectedBrand.id, platform: aeoAiPlatform }),
                  });
                  const data = await res.json();
                  if (data.results) {
                    setAeoAiResults(data.results);
                    setAeoAiScore({ cited_count: data.cited_count, total: data.total_keywords, score: data.score });
                    // 기록 목록 새로고침
                    try {
                      const hRes = await fetch(`/api/geo/aeo-check?brand_id=${selectedBrand.id}&type=history&platform=aeo_${aeoAiPlatform}`);
                      if (hRes.ok) { const runs = await hRes.json(); setAeoAiRuns(runs); if (runs.length > 0) setAeoAiSelectedRun(runs[0]); }
                    } catch { /* ignore */ }
                  } else { alert(data.error || "체크 실패"); }
                } catch { alert("체크 실패"); }
                setAeoAiRunning(false);
              }} disabled={aeoAiRunning || aeoKeywords.length === 0}>
                {aeoAiRunning ? <><span className="animate-spin mr-1">⏳</span>체크 중...</> : <><Bot className="h-4 w-4 mr-1" />AEO 체크 실행 (AI 프록시)</>}
              </Button>
              <p className="text-[10px] text-slate-400 text-center mt-1">OpenAI web_search 기반 · 5~10초/키워드</p>

              <div className="my-3 border-t border-dashed border-slate-200" />

              <Button className="w-full" size="sm" variant="outline" onClick={async () => {
                if (!selectedBrand || aeoKeywords.length === 0) return;
                try {
                  const res = await fetch("/api/geo/aeo-scan-queue", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ brand_id: selectedBrand.id, platform: aeoAiPlatform }),
                  });
                  const data = await res.json();
                  if (data.queued) {
                    alert(`실제 브라우저 스캔이 큐에 등록됐습니다.\n로컬 워커가 수 분 내에 처리하고, 완료 후 '최근 결과' 를 새로고침하면 반영됩니다.`);
                  } else if (data.already_running) {
                    alert(`이미 진행 중인 스캔이 있습니다 (${data.status})`);
                  } else if (data.sql) {
                    alert(`aeo_scan_queue 테이블이 없습니다. Supabase SQL Editor에서 supabase_migrations/aeo_scan_queue.sql 을 실행하세요.`);
                  } else {
                    alert(data.error || "요청 실패");
                  }
                } catch { alert("요청 실패"); }
              }} disabled={aeoKeywords.length === 0}>
                🌐 실제 브라우저 스캔 (Playwright)
              </Button>
              <p className="text-[10px] text-slate-400 text-center mt-1">로컬 Windows 워커가 실제 AI Overview/브리핑 DOM 파싱</p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-xs font-semibold text-slate-600 mb-1.5">AEO 체크란?</h3>
              <div className="space-y-1 text-[10px] text-slate-500">
                <p>검색엔진의 AI 답변에 우리 콘텐츠가 인용되는지 확인합니다.</p>
                <div className="flex items-center gap-1.5"><CheckCircle2 className="h-2.5 w-2.5 text-purple-500 shrink-0" />Google AI Overview 인용</div>
                <div className="flex items-center gap-1.5"><CheckCircle2 className="h-2.5 w-2.5 text-purple-500 shrink-0" />네이버 AI 답변 인용</div>
                <div className="flex items-center gap-1.5"><CheckCircle2 className="h-2.5 w-2.5 text-purple-500 shrink-0" />인용 출처 URL 확인</div>
              </div>
            </div>
          </div>

          {/* 우측: 결과 */}
          <div className="flex-1 min-w-0 space-y-4">
            {aeoAiScore && (
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                <div className="bg-white rounded-xl border border-slate-200 p-3 sm:p-4 text-center">
                  <p className="text-[10px] text-slate-400 uppercase">AI 인용률</p>
                  <p className={cn("text-xl sm:text-2xl font-bold mt-1", aeoAiScore.score >= 50 ? "text-emerald-600" : aeoAiScore.score >= 20 ? "text-amber-500" : "text-red-500")}>{aeoAiScore.score}%</p>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
                  <p className="text-[10px] text-slate-400 uppercase">인용 키워드</p>
                  <p className="text-2xl font-bold text-purple-600 mt-1">{aeoAiScore.cited_count}<span className="text-sm text-slate-400">/{aeoAiScore.total}</span></p>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
                  <p className="text-[10px] text-slate-400 uppercase">플랫폼</p>
                  <p className="text-lg font-bold mt-1">{aeoAiPlatform === "google" ? "Google AI" : "네이버 AI"}</p>
                </div>
              </div>
            )}

            {/* 체크 기록 */}
            {aeoAiRuns.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <h3 className="text-xs font-semibold text-slate-700 mb-2">체크 기록</h3>
                <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
                  {aeoAiRuns.map(run => (
                    <button key={run.id} onClick={() => {
                      setAeoAiSelectedRun(run);
                      setAeoAiResults(run.results);
                      setAeoAiScore({ cited_count: run.cited_count, total: run.total_keywords, score: run.score });
                    }}
                      className={cn("shrink-0 px-3 py-2 rounded-lg text-xs transition-colors border",
                        aeoAiSelectedRun?.id === run.id
                          ? "bg-purple-50 border-purple-300 text-purple-700 font-semibold"
                          : "border-slate-200 text-slate-500 hover:bg-slate-50"
                      )}>
                      <div className="font-medium">{run.created_at.slice(5, 10)}</div>
                      <div className={cn("text-[10px]", run.score > 0 ? "text-purple-500" : "text-slate-400")}>{run.score}% · {run.cited_count}/{run.total_keywords}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {aeoAiResults ? (
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <h3 className="text-sm font-semibold text-slate-700 mb-3">키워드별 AI 인용 결과</h3>
                <div className="space-y-2">
                  {aeoAiResults.map((r, i) => (
                    <div key={i} className="border border-slate-200 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-slate-700">{r.keyword}</span>
                        <div className="flex gap-1">
                          {r.cited
                            ? <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-600 font-medium">AI 인용됨</span>
                            : <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-50 text-red-500 font-medium">미인용</span>}
                        </div>
                      </div>
                      {r.our_mentions.length > 0 && (
                        <p className="text-[10px] text-purple-600 mb-1">인용 도메인: {r.our_mentions.join(", ")}</p>
                      )}
                      <p className="text-[10px] text-slate-500 line-clamp-2">{r.ai_summary.slice(0, 200)}...</p>
                      <button onClick={() => setAeoAiDetail(r)} className="text-[10px] text-blue-500 hover:underline mt-1">상세 보기</button>
                    </div>
                  ))}
                </div>
              </div>
            ) : aeoAiRunning ? (
              <div className="rounded-xl border border-purple-200 bg-purple-50 p-8 text-center">
                <p className="text-sm text-purple-700 animate-pulse">AI 답변 인용 체크 중... ({aeoKeywords.length}개 키워드)</p>
                <p className="text-xs text-purple-500 mt-1">{aeoAiPlatform === "google" ? "Google AI Overview" : "네이버 AI 답변"} 확인 중</p>
              </div>
            ) : (
              <div className="text-center py-20">
                <Bot className="h-14 w-14 text-slate-200 mx-auto mb-4" />
                <p className="text-sm text-slate-400">AI 답변에 우리 콘텐츠가 인용되는지 확인합니다</p>
                <p className="text-xs text-slate-300 mt-1">Google AI Overview · 네이버 AI 답변 (CLOVA X)</p>
              </div>
            )}

            {/* 상세 모달 */}
            {aeoAiDetail && (
              <Dialog open onOpenChange={() => setAeoAiDetail(null)}>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="text-sm">"{aeoAiDetail.keyword}" — {aeoAiDetail.cited ? "AI 인용됨" : "미인용"}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3 mt-2">
                    {aeoAiDetail.cited && aeoAiDetail.our_mentions.length > 0 && (
                      <div className="bg-purple-50 rounded-lg p-3">
                        <p className="text-[10px] text-purple-600 font-semibold">인용된 도메인: {aeoAiDetail.our_mentions.join(", ")}</p>
                      </div>
                    )}
                    {aeoAiDetail.source_urls.length > 0 && (
                      <div>
                        <p className="text-[10px] text-slate-500 font-semibold mb-1">AI 답변 인용 URL</p>
                        <div className="space-y-1">
                          {aeoAiDetail.source_urls.map((u, i) => {
                            const isOurs = OUR_DOMAINS_CLIENT.some(d => u.toLowerCase().includes(d));
                            return (
                              <a key={i} href={u} target="_blank" rel="noreferrer" className={cn("text-xs block truncate hover:underline", isOurs ? "text-purple-600 font-medium" : "text-blue-500")}>
                                {isOurs && "★ "}{u.replace(/https?:\/\//, "").slice(0, 60)}
                              </a>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    <div>
                      <p className="text-[10px] text-slate-500 font-semibold mb-1">AI 답변 전체</p>
                      <div className="bg-slate-50 rounded-lg p-3 max-h-[400px] overflow-y-auto">
                        <p className="text-xs text-slate-700 whitespace-pre-wrap">{aeoAiDetail.ai_summary}</p>
                      </div>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>
      )}

      {mainTab === "blog" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 좌측: 블로그 생성 결과 */}
          <div className="lg:col-span-2 space-y-4">
            {/* 원본 결과 표시 */}
            {false && (
              <div></div>
            )}

            {blogResult ? (
              <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-700">생성 결과 {blogResult.character_count ? `(${blogResult.character_count}자)` : ""}</h2>
                  <div className="flex gap-2">
                    <button onClick={async () => {
                      if (!selectedBrand) return;
                      const today = new Date().toISOString().slice(0, 10);
                      const res = await fetch("/api/geo/blog-drafts", {
                        method: "POST", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          brand_id: selectedBrand.id, channel: "frandoor",
                          title: blogResult.title ?? "", content: blogResult.content ?? "",
                          meta_description: blogResult.meta_description ?? "",
                          keywords: blogResult.keywords ?? [], faq: blogResult.faq ?? [],
                          schema_markup: blogResult.schema_markup ?? "", target_date: today,
                        }),
                      });
                      if (res.ok) alert("저장 완료");
                      else alert("저장 실패");
                    }} className="text-xs text-emerald-600 hover:text-emerald-800 flex items-center gap-1"><Download className="h-3 w-3" />저장하기</button>
                    <button onClick={() => { navigator.clipboard.writeText(blogResult.content ?? ""); alert("본문 복사됨"); }}
                      className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1"><Copy className="h-3 w-3" />본문 복사</button>
                    {blogResult.schema_markup && (
                      <button onClick={() => { navigator.clipboard.writeText(blogResult.schema_markup ?? ""); alert("스키마 복사됨"); }}
                        className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1"><Copy className="h-3 w-3" />스키마 복사</button>
                    )}
                  </div>
                </div>

                {/* 제목 + 메타 */}
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

                {/* 통합 프리뷰 패널 */}
                {(() => {
                  type PreviewTab = "frandoor" | "tistory" | "naver" | "medium";
                  const tabs: { key: PreviewTab; label: string; color: string }[] = [
                    { key: "frandoor", label: "원본", color: "blue" },
                    { key: "tistory", label: "티스토리", color: "orange" },
                    { key: "naver", label: "네이버", color: "green" },
                    { key: "medium", label: "Medium", color: "slate" },
                  ];
                  const activePreview = blogPlatform as PreviewTab;
                  const convertedContent = blogConvertedResults[activePreview] ?? null;
                  const isOriginal = activePreview === "frandoor";
                  const hasConverted = !isOriginal && !!convertedContent;

                  // 채널별 생성/변환 트리거
                  const triggerConvert = async (target: PreviewTab) => {
                    if (target === "frandoor" || blogConvertedResults[target] || blogConverting) return;
                    setBlogConverting(target);
                    try {
                      if (target === "medium") {
                        // Medium: 기존 blog-convert (영문 번역)
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
                        // tistory/naver: 앵글 로테이션으로 새 글 생성
                        const otherTitles = Object.entries(blogAllResults)
                          .filter(([ch, v]) => ch !== target && v?.title)
                          .map(([, v]) => v.title as string);
                        if (blogResult.title) otherTitles.unshift(blogResult.title);
                        const res = await fetch("/api/geo/blog-generate", {
                          method: "POST", headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            brand_id: selectedBrand!.id,
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

                  return (
                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                      {/* 플랫폼 탭 */}
                      <div className="flex items-center bg-slate-50 border-b border-slate-200">
                        {tabs.map(t => (
                          <button key={t.key} onClick={() => { setBlogPlatform(t.key); if (t.key !== "frandoor") triggerConvert(t.key); }}
                            className={cn("flex-1 text-[10px] font-medium py-2 border-b-2 transition-colors",
                              activePreview === t.key ? `border-${t.color}-500 text-${t.color}-600 bg-white` : "border-transparent text-slate-400 hover:text-slate-600"
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

                      {/* 프리뷰 영역 */}
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

                      {/* 복사 버튼 바 */}
                      <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-t border-slate-200">
                        <span className="text-[10px] text-slate-400">{blogResult.character_count ? `${blogResult.character_count}자` : ""}</span>
                        <div className="flex gap-1">
                          {isOriginal && (
                            <button onClick={() => { navigator.clipboard.writeText(blogResult.content ?? ""); alert("원본 HTML 복사됨"); }}
                              className="text-[10px] px-2 py-0.5 rounded bg-blue-100 text-blue-700 hover:bg-blue-200"><Copy className="h-3 w-3 inline mr-0.5" />원본 복사</button>
                          )}
                          {activePreview === "tistory" && hasConverted && (() => {
                            const chMeta = blogAllResults["tistory"] ?? blogResult;
                            return <>
                            <button onClick={() => { navigator.clipboard.writeText(convertedContent!); alert("티스토리 HTML 복사됨"); }}
                              className="text-[10px] px-2 py-0.5 rounded bg-orange-100 text-orange-700 hover:bg-orange-200"><Copy className="h-3 w-3 inline mr-0.5" />HTML 복사</button>
                            <button onClick={async () => {
                              if (!selectedBrand) return;
                              const res = await fetch("/api/geo/blog-drafts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brand_id: selectedBrand.id, channel: "tistory", title: chMeta.title ?? "", content: convertedContent, meta_description: chMeta.meta_description, keywords: chMeta.keywords, faq: chMeta.faq, schema_markup: chMeta.schema_markup }) });
                              alert(res.ok ? "티스토리 초안 저장됨" : "저장 실패");
                            }} className="text-[10px] px-2 py-0.5 rounded bg-orange-50 text-orange-600 hover:bg-orange-100"><Download className="h-3 w-3 inline mr-0.5" />저장</button>
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
                              className="text-[10px] px-2 py-0.5 rounded bg-green-100 text-green-700 hover:bg-green-200"><Copy className="h-3 w-3 inline mr-0.5" />복사</button>
                            <button onClick={async () => {
                              if (!selectedBrand) return;
                              const res = await fetch("/api/geo/blog-drafts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brand_id: selectedBrand.id, channel: "naver", title: chMeta.title ?? "", content: convertedContent, meta_description: chMeta.meta_description, keywords: chMeta.keywords, faq: chMeta.faq }) });
                              alert(res.ok ? "네이버 초안 저장됨" : "저장 실패");
                            }} className="text-[10px] px-2 py-0.5 rounded bg-green-50 text-green-600 hover:bg-green-100"><Download className="h-3 w-3 inline mr-0.5" />저장</button>
                            <a href="https://blog.naver.com/MyBlog.naver" target="_blank" rel="noreferrer"
                              className="text-[10px] px-2 py-0.5 rounded bg-green-200 text-green-800 hover:bg-green-300">네이버 열기</a>
                          </>;
                          })()}
                          {activePreview === "medium" && hasConverted && <>
                            <button onClick={() => { navigator.clipboard.writeText(convertedContent!); alert("Markdown 복사됨"); }}
                              className="text-[10px] px-2 py-0.5 rounded bg-slate-200 text-slate-700 hover:bg-slate-300"><Copy className="h-3 w-3 inline mr-0.5" />Markdown 복사</button>
                            <button onClick={async () => {
                              if (!selectedBrand) return;
                              const res = await fetch("/api/geo/blog-drafts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brand_id: selectedBrand.id, channel: "medium", title: blogResult.title ?? "", content: convertedContent, meta_description: blogResult.meta_description, keywords: blogResult.keywords, faq: blogResult.faq }) });
                              alert(res.ok ? "Medium 초안 저장됨" : "저장 실패");
                            }} className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-600 hover:bg-slate-200"><Download className="h-3 w-3 inline mr-0.5" />저장</button>
                          </>}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* FAQ */}
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

                {/* 스키마 마크업 */}
                {blogResult.schema_markup && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Schema Markup (JSON-LD)</p>
                    <pre className="bg-slate-900 text-green-400 text-[10px] rounded-lg p-3 overflow-x-auto max-h-[200px]">{blogResult.schema_markup}</pre>
                  </div>
                )}

                {/* SEO 팁 */}
                {blogResult.seo_score_tips && blogResult.seo_score_tips.length > 0 && (
                  <div className="bg-amber-50 rounded-lg p-3">
                    <p className="text-xs font-semibold text-amber-700 mb-1">SEO 개선 팁</p>
                    <ul className="text-xs text-amber-600 space-y-0.5">
                      {blogResult.seo_score_tips.map((tip, i) => <li key={i}>• {tip}</li>)}
                    </ul>
                  </div>
                )}

                {/* 인용 출처 */}
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
                <p className="text-sm text-slate-400">우측에서 주제를 입력하고 생성하세요</p>
                <p className="text-xs text-slate-300 mt-1">팩트 데이터 기반 SEO·AEO·GEO 최적화 콘텐츠</p>
              </div>
            )}
          </div>

          {/* 우측: 블로그 설정 */}
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-slate-700 mb-3">
                <Sparkles className="h-4 w-4 inline mr-1" />글 생성 설정
              </h2>
              <div className="space-y-3">
                {/* 생성 방식 안내 */}
                <div className="bg-blue-50 rounded-lg px-3 py-2 space-y-1">
                  <p className="text-[10px] font-semibold text-blue-800">AI 중복 콘텐츠 방지 — 진입 질문 자동 로테이션</p>
                  <p className="text-[10px] text-blue-700">주제에 따라 채널별 앵글이 자동 배분됩니다:</p>
                  <p className="text-[10px] text-blue-600">💰 얼마 드냐(비용) / 📈 얼마 남냐(수익) / ⚖️ 왜 이걸 해야 하냐(비교)</p>
                  <p className="text-[10px] text-blue-500">예) 비용 주제 → frandoor:비용 / 티스토리:수익 / 네이버:비교</p>
                </div>

                {/* AI 프로바이더 */}
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
                          !p.ready && "opacity-40 cursor-not-allowed"
                        )}>
                        {p.label}{!p.ready && " (준비중)"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 주제 */}
                {/* 독자 단계 */}
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
                          blogReaderStage === s.key ? "bg-slate-900 text-white border-slate-900" : "border-slate-200 text-slate-400 hover:bg-slate-50"
                        )}>
                        <span className="block font-medium">{s.label}</span>
                        <span className="opacity-60">{s.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 검색 의도 */}
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
                          blogSearchIntent === s.key ? "bg-slate-900 text-white border-slate-900" : "border-slate-200 text-slate-400 hover:bg-slate-50"
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
                    placeholder={`예: ${selectedBrand?.name} 창업비용 총정리\n${selectedBrand?.name} vs 경쟁 브랜드 비교`} />
                </div>

                {/* 참고 블로그 링크 */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label className="text-xs">참고 블로그 (말투·구조 학습용)</Label>
                    <button onClick={async () => {
                      if (!selectedBrand) return;
                      const links = blogRefLinks.filter(l => l.trim());
                      // fact_data에서 기존 ref_links 제거 후 새로 추가
                      const currentFactData = (selectedBrand.fact_data && Array.isArray(selectedBrand.fact_data)) ? selectedBrand.fact_data.filter((d: { label: string }) => d.label !== "__blog_ref_links__") : [];
                      const newFactData = [...currentFactData, { keyword: JSON.stringify(links), label: "__blog_ref_links__" }];
                      await fetch("/api/geo/brands", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: selectedBrand.id, fact_data: newFactData }) });
                      setSelectedBrand({ ...selectedBrand, fact_data: newFactData as Brand["fact_data"] });
                      alert(`${links.length}개 링크 저장됨`);
                    }} className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-600 hover:bg-slate-200">저장</button>
                  </div>
                  <p className="text-[10px] text-slate-400 mb-1">잘 쓴 블로그 URL — 톤·구조를 분석해서 반영</p>
                  <div className="space-y-1">
                    {blogRefLinks.map((link, i) => (
                      <Input key={i} value={link} onChange={e => { const next = [...blogRefLinks]; next[i] = e.target.value; setBlogRefLinks(next); }}
                        className="text-xs h-7" placeholder={`참고 링크 ${i + 1}`} />
                    ))}
                  </div>
                </div>

                {/* 생성 버튼 */}
                <Button className="w-full" onClick={async () => {
                  if (!blogTopic.trim() || !selectedBrand || blogGenerating) return;
                  setBlogGenerating(true);
                  setBlogResult(null);
                  const refLinks = blogRefLinks.filter(l => l.trim());
                  try {
                    const res = await fetch("/api/geo/blog-generate", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ brand_id: selectedBrand.id, platform: "frandoor", topic: blogTopic, provider: blogProvider, ref_links: refLinks, reader_stage: blogReaderStage, search_intent: blogSearchIntent }),
                    });
                    const data = await res.json();
                    if (!res.ok) {
                      setBlogResult({ error: data.error || `생성 실패 (${res.status})` });
                    } else {
                      setBlogResult(data);
                    }
                  } catch {
                    setBlogResult({ error: "생성 실패. 다시 시도해주세요." });
                  }
                  setBlogGenerating(false);
                }} disabled={blogGenerating || !blogTopic.trim()}>
                  {blogGenerating ? (
                    <><span className="animate-spin mr-1">⏳</span>생성 중...</>
                  ) : (
                    <><Sparkles className="h-4 w-4 mr-1" />원본 글 생성</>
                  )}
                </Button>
              </div>
            </div>

            {/* 최적화 가이드 */}
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
      )}

      {mainTab === "check" && <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
            const totalPages = Math.ceil(filteredRuns.length / PAGE_SIZE);
            const pagedRuns = filteredRuns.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
            return (
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-slate-700">{checkTab === "before" ? "BEFORE 자료" : "체크 기록"}</h2>
                  <span className="text-xs text-slate-400">{filteredRuns.length}회 실행</span>
                </div>
                {filteredRuns.length === 0
                  ? <p className="text-sm text-slate-400 py-8 text-center">{checkTab === "before" ? "BEFORE 자료가 없습니다. BEFORE 체크를 실행하세요." : "아직 체크 기록이 없습니다. GEO 체크를 실행하세요."}</p>
                  : <>
                      <div className="space-y-2">
                        {pagedRuns.map(r => {
                          const st = getRunStats(r);
                          return (
                            <div key={r.id} className={cn("flex items-center gap-3 p-3 rounded-lg transition-colors group",
                              selectedRun?.id === r.id ? "bg-blue-50 border border-blue-200" : "hover:bg-slate-50 border border-transparent"
                            )}>
                              <button onClick={() => setSelectedRun(r)} className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0 text-left">
                                <div className="shrink-0 text-center">
                                  <p className="text-sm font-bold text-slate-700">{r.run_date.slice(5)}</p>
                                  <p className="text-[10px] text-slate-400">{r.run_date.slice(0, 4)}</p>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 sm:gap-3">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-xs text-slate-500">노출</span>
                                      <span className={cn("text-sm font-bold", st.expScore >= 50 ? "text-emerald-600" : st.expScore >= 20 ? "text-amber-500" : "text-red-500")}>{st.expScore}%</span>
                                      <span className="text-[10px] text-slate-400">({st.expMentioned}/{st.expItems})</span>
                                    </div>
                                    <div className="hidden sm:block w-px h-4 bg-slate-200" />
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-xs text-slate-500">정확</span>
                                      <span className={cn("text-sm font-bold", st.avgAcc >= 50 ? "text-blue-600" : st.avgAcc >= 20 ? "text-amber-500" : "text-red-500")}>{st.avgAcc}%</span>
                                      <span className="text-[10px] text-slate-400">(D3 {st.accItems})</span>
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
                              }} className="opacity-100 lg:opacity-0 lg:group-hover:opacity-100 text-red-400 hover:text-red-600 shrink-0 p-1.5">
                                <Trash2 className="h-4 w-4" />
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
                  {promptCategories.map(cat => {
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
                            }} className="opacity-100 lg:opacity-0 lg:group-hover:opacity-100 text-red-400 hover:text-red-600 p-1.5 shrink-0"><Trash2 className="h-4 w-4" /></button>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
            }
          </div>
        </div>

        {/* 우측: 추이 + 직접 확인 + 팩트데이터 */}
        <div className="space-y-6">
          {/* 추이 — 꺾은선 그래프 */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-700">
                <TrendingUp className="h-4 w-4 inline mr-1" />추이
              </h2>
              {regularRuns.length > 0 && <button onClick={() => setTrendDetailOpen(true)} className="text-xs text-blue-500 hover:underline">상세보기</button>}
            </div>
            {regularRuns.length === 0
              ? <p className="text-xs text-slate-400">체크 기록이 없습니다.</p>
              : (() => {
                  const latestBefore = beforeRuns.length > 0 ? beforeRuns[0] : null;
                  const sorted = [...(latestBefore ? [latestBefore] : []), ...[...regularRuns].reverse()];
                  const expData = sorted.map(r => getRunStats(r).expScore);
                  const accData = sorted.map(r => getRunStats(r).avgAcc);
                  const labels = sorted.map((r, i) => i === 0 && latestBefore ? "BF" : r.run_date.slice(5));
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

          {/* 팩트 데이터 관리 */}
          {(() => {
            type FactFile = { url: string; name: string };
            const factFiles: FactFile[] = (() => {
              if (!selectedBrand?.fact_file_url) return [];
              try {
                const parsed = JSON.parse(selectedBrand.fact_file_url);
                if (Array.isArray(parsed)) {
                  return parsed.map((v: string | FactFile) => typeof v === "string" ? { url: v, name: v.split("/").pop() ?? "파일" } : v);
                }
                return [];
              } catch { return selectedBrand.fact_file_url ? [{ url: selectedBrand.fact_file_url, name: selectedBrand.fact_file_url.split("/").pop() ?? "파일" }] : []; }
            })();
            const updateFactFiles = async (files: FactFile[]) => {
              const val = files.length > 0 ? JSON.stringify(files) : "";
              // 파일 변경 시 fact_data에서 추출 데이터 초기화 (ref_links는 보존)
              const preserved = (selectedBrand?.fact_data && Array.isArray(selectedBrand.fact_data))
                ? selectedBrand.fact_data.filter((d: { label: string }) => d.label === "__blog_ref_links__")
                : [];
              await fetch("/api/geo/brands", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: selectedBrand!.id, fact_file_url: val, fact_data: preserved.length > 0 ? preserved : null }) });
              setSelectedBrand({ ...selectedBrand!, fact_file_url: val, fact_data: preserved.length > 0 ? preserved as Brand["fact_data"] : undefined });
            };
            return (
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <h2 className="text-sm font-semibold text-slate-700 mb-2">팩트 데이터 (D3 정확도 기준)</h2>
                <p className="text-xs text-slate-400 mb-3">D3 답변 정확도를 이 데이터 기준으로 체크. 없으면 홈페이지 자동 추출.</p>
                <label className="cursor-pointer inline-block mb-2">
                  <input type="file" accept=".txt,.csv,.docx,.xlsx,.pdf" multiple className="hidden" onChange={async (e) => {
                    const fileList = e.target.files;
                    if (!fileList || fileList.length === 0 || !selectedBrand) return;
                    const { createClient: cb } = await import("@/utils/supabase/client");
                    const sb = cb();
                    const newFiles = [...factFiles];
                    for (const file of Array.from(fileList)) {
                      const ext = file.name.split(".").pop() ?? "";
                      const safeName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
                      const storagePath = `geo-facts/${selectedBrand.id}/${safeName}`;
                      const { data: signedData, error: signErr } = await sb.storage.from("documents").createSignedUploadUrl(storagePath);
                      if (signErr || !signedData) { alert(`업로드 준비 실패: ${file.name}`); continue; }
                      const { error: upErr } = await sb.storage.from("documents").uploadToSignedUrl(storagePath, signedData.token, file, { contentType: file.type || "application/octet-stream" });
                      if (upErr) { alert(`업로드 실패: ${file.name}`); continue; }
                      const { data: u } = sb.storage.from("documents").getPublicUrl(storagePath);
                      newFiles.push({ url: u.publicUrl, name: file.name });
                    }
                    await updateFactFiles(newFiles);
                    e.target.value = "";
                  }} />
                  <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border border-slate-200 hover:bg-slate-50 text-slate-600"><Upload className="h-3.5 w-3.5" />파일 업로드</span>
                </label>
                {factFiles.length > 0 ? (
                  <div className="space-y-1">
                    {factFiles.map((f, i) => (
                      <div key={i} className="flex items-center gap-2 group">
                        <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                        <a href={f.url} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline truncate flex-1">{f.name}</a>
                        <button onClick={() => updateFactFiles(factFiles.filter((_, j) => j !== i))} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    <div className="flex items-center gap-2 mt-2">
                      <p className="text-[10px] text-slate-400">{factFiles.length}개 파일</p>
                      <button onClick={async () => {
                        if (!selectedBrand) return;
                        const btn = document.getElementById("extract-btn");
                        if (btn) btn.textContent = "추출 중...";
                        try {
                          const res = await fetch("/api/geo/extract-facts", {
                            method: "POST", headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ brand_id: selectedBrand.id }),
                          });
                          const data = await res.json();
                          if (data.ok) {
                            alert(`팩트 추출 완료!\n키워드 ${data.keywords_count}개 추출${data.has_official_data ? "\n공정위 자료 포함" : ""}`);
                            const bRes = await fetch("/api/geo/brands");
                            if (bRes.ok) { const brands = await bRes.json(); const updated = brands.find((b: Brand) => b.id === selectedBrand.id); if (updated) setSelectedBrand(updated); }
                          } else { alert(data.error || "추출 실패"); }
                        } catch { alert("추출 실패"); }
                        if (btn) btn.textContent = "팩트 추출";
                      }} id="extract-btn"
                        className="text-[10px] px-2 py-0.5 rounded bg-violet-50 text-violet-600 hover:bg-violet-100 font-medium">
                        팩트 추출
                      </button>
                      {selectedBrand?.fact_data && Array.isArray(selectedBrand.fact_data) && selectedBrand.fact_data.filter((d: { label: string }) => d.label !== "__raw_text__").length > 0 && (
                        <span className="text-[10px] text-emerald-500">✓ {selectedBrand.fact_data.filter((d: { label: string }) => d.label !== "__raw_text__").length}개 키워드 DB 저장됨</span>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-400">
                    {selectedBrand?.landing_url ? "팩트 파일 없음 → 홈페이지에서 자동 추출" : "팩트 파일 없음 · 홈페이지 URL 등록 필요"}
                  </p>
                )}
              </div>
            );
          })()}

          {/* 브랜드 이미지 관리 */}
          {(() => {
            type BrandImage = { url: string; name: string; uploaded_at: string };
            const getImages = (): BrandImage[] => {
              if (!selectedBrand?.fact_data || !Array.isArray(selectedBrand.fact_data)) return [];
              const entry = selectedBrand.fact_data.find((d: { label: string }) => d.label === "__brand_images__");
              if (!entry) return [];
              try { return JSON.parse((entry as { keyword: string }).keyword); } catch { return []; }
            };
            const images = getImages();
            const updateImages = async (newImages: BrandImage[]) => {
              const fd = (selectedBrand?.fact_data && Array.isArray(selectedBrand.fact_data))
                ? selectedBrand.fact_data.filter((d: { label: string }) => d.label !== "__brand_images__")
                : [];
              const newFd = [...fd, { keyword: JSON.stringify(newImages), label: "__brand_images__" }];
              await fetch("/api/geo/brands", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: selectedBrand!.id, fact_data: newFd }) });
              setSelectedBrand({ ...selectedBrand!, fact_data: newFd as Brand["fact_data"] });
            };
            return (
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <h2 className="text-sm font-semibold text-slate-700 mb-2">브랜드 이미지</h2>
                <p className="text-xs text-slate-400 mb-3">블로그 발행 시 자동 삽입됩니다</p>

                {/* 업로드 */}
                <label className="cursor-pointer inline-block mb-3">
                  <input type="file" accept="image/*" multiple className="hidden" onChange={async (e) => {
                    const fileList = e.target.files;
                    if (!fileList || fileList.length === 0 || !selectedBrand) return;
                    const { createClient: cb } = await import("@/utils/supabase/client");
                    const sb = cb();
                    const newImages = [...images];
                    for (const file of Array.from(fileList)) {
                      const ext = file.name.split(".").pop() ?? "jpg";
                      const safeName = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;
                      const storagePath = `brand-images/${selectedBrand.id}/${safeName}`;
                      const { data: signedData, error: signErr } = await sb.storage.from("documents").createSignedUploadUrl(storagePath);
                      if (signErr || !signedData) continue;
                      const { error: upErr } = await sb.storage.from("documents").uploadToSignedUrl(storagePath, signedData.token, file, { contentType: file.type });
                      if (upErr) continue;
                      const { data: u } = sb.storage.from("documents").getPublicUrl(storagePath);
                      newImages.push({ url: u.publicUrl, name: file.name, uploaded_at: new Date().toISOString() });
                    }
                    await updateImages(newImages);
                    e.target.value = "";
                  }} />
                  <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border border-slate-200 hover:bg-slate-50 text-slate-600"><Upload className="h-3.5 w-3.5" />이미지 업로드</span>
                </label>

                {/* 이미지 그리드 미리보기 */}
                {images.length > 0 ? (
                  <div className="grid grid-cols-3 gap-2">
                    {images.map((img, i) => (
                      <div key={i} className="relative group rounded-lg overflow-hidden border border-slate-200">
                        <img src={img.url} alt={img.name} className="w-full h-20 object-cover" />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                          <div className="opacity-0 group-hover:opacity-100 flex gap-1">
                            <button onClick={() => { navigator.clipboard.writeText(img.url); alert("URL 복사됨"); }}
                              className="p-1 rounded bg-white/90 text-slate-600 hover:bg-white text-xs"><Copy className="h-3 w-3" /></button>
                            <button onClick={() => updateImages(images.filter((_, j) => j !== i))}
                              className="p-1 rounded bg-white/90 text-red-500 hover:bg-white text-xs"><Trash2 className="h-3 w-3" /></button>
                          </div>
                        </div>
                        <p className="text-[9px] text-slate-400 px-1 py-0.5 truncate">{img.name}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-400">이미지를 업로드하면 블로그 생성 시 자동으로 삽입됩니다</p>
                )}
                {images.length > 0 && <p className="text-[10px] text-slate-400 mt-2">{images.length}개 이미지</p>}
              </div>
            );
          })()}
        </div>
      </div>}

      {/* 상세 결과 */}
      {selectedRun && (
        <Dialog open onOpenChange={() => setSelectedRun(null)}>
          <DialogContent className="max-w-3xl w-[calc(100vw-1rem)] sm:w-auto max-h-[95vh] sm:max-h-[90vh] p-0 overflow-hidden">
            {/* 헤더: 날짜 선택 */}
            <div className="px-3 sm:px-5 py-3 border-b border-slate-200 bg-white sticky top-0 z-10">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <DialogHeader className="p-0">
                    <DialogTitle className="text-sm sm:text-base">GEO 체크 결과{selectedRun.model.startsWith("before:") && <span className="ml-2 text-[10px] font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded">BEFORE</span>}</DialogTitle>
                  </DialogHeader>
                  <p className="text-xs text-slate-400 mt-0.5 truncate">{selectedRun.model.replace("before:", "")} · 노출률 {selectedRun.score}% ({selectedRun.mentioned_count}/{selectedRun.total_prompts})</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
                    {filteredRuns.slice(0, 5).map(r => (
                      <button key={r.id} onClick={() => setSelectedRun(r)}
                        className={cn("px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0",
                          r.id === selectedRun.id ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                        )}>
                        {r.run_date.slice(5)}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => downloadReport(selectedRun)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 shrink-0" title="리포트 다운로드">
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
                  <div className="flex gap-2 sm:gap-4 mt-3">
                    <div className="flex-1 bg-slate-50 rounded-lg p-2.5 sm:p-3">
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

              {/* 답변 요약 — 카테고리별 */}
              {(() => {
                const allItems = selectedRun.geo_check_items ?? [];
                const itemCats = getUsedCategories(allItems);
                const catInfo = itemCats.map(cat => {
                  const label = cat.split(" ")[0];
                  return { cat, label, intent: DEPTH_DESC[label] ?? cat.slice(label.length + 1) };
                });
                return (
                  <div className="mt-3 space-y-2">
                    {catInfo.map(({ cat, label, intent }) => {
                      const ci = allItems.filter(i => (i.category ?? "") === cat);
                      if (ci.length === 0) return null;
                      const isD3 = cat.startsWith("D3");
                      const mentioned = ci.filter(i => i.mentioned).length;
                      const score = isD3 ? Math.round(ci.reduce((s, i) => s + i.accuracy_score, 0) / ci.length) : Math.round((mentioned / ci.length) * 100);
                      return (
                        <div key={cat} className={cn("border-l-4 rounded-r-lg px-3 py-2", isD3 ? "bg-blue-50 border-blue-300" : score > 0 ? "bg-emerald-50 border-emerald-400" : "bg-red-50 border-red-300")}>
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold text-slate-700">{label} — {intent}</p>
                            <span className={cn("text-xs font-bold", isD3 ? "text-blue-600" : score > 0 ? "text-emerald-600" : "text-red-500")}>{score}%</span>
                          </div>
                          <p className="text-[10px] text-slate-400 mt-0.5">{DEPTH_DESC[label]}</p>
                          <p className="text-[11px] text-slate-500 mt-1">
                            {ci.map(i => isD3
                              ? `${i.prompt_text.slice(0, 22)}… ${i.accuracy_score}%`
                              : `${i.prompt_text.slice(0, 22)}… ${i.mentioned ? "O" : "X"}`
                            ).join(" · ")}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* 본문 */}
            <div className="overflow-y-auto px-3 sm:px-5 py-4 space-y-4" style={{ maxHeight: "calc(95vh - 320px)" }}>
              {/* FAQ 상세 결과 테이블 — 뎁스별 구분 */}
              {(() => {
                const allItems = selectedRun.geo_check_items ?? [];
                const faqCats = getUsedCategories(allItems);
                const catDefs = faqCats.map(cat => ({
                  cat, label: cat.split(" ")[0], isD3: cat.startsWith("D3"),
                }));
                if (allItems.length === 0) return null;
                return (
                  <div>
                    <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">FAQ {allItems.length}개 상세 결과</h3>
                    <div className="border border-slate-200 rounded-lg overflow-x-auto">
                      <table className="w-full text-xs min-w-[560px]">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="px-3 py-2 text-left text-slate-500 font-semibold w-10">뎁스</th>
                            <th className="px-3 py-2 text-left text-slate-500 font-semibold">질문</th>
                            <th className="px-3 py-2 text-center text-slate-500 font-semibold w-[70px]">브랜드언급</th>
                            <th className="px-3 py-2 text-center text-slate-500 font-semibold w-[70px]">내용일치</th>
                            <th className="px-3 py-2 text-center text-slate-500 font-semibold w-[80px]">상태</th>
                          </tr>
                        </thead>
                        <tbody>
                          {catDefs.map(c => {
                            const catItems = allItems.filter(i => (i.category ?? "") === c.cat);
                            if (catItems.length === 0) return null;
                            return (
                              <React.Fragment key={c.cat}>
                                <tr className="bg-slate-50">
                                  <td colSpan={5} className="px-3 py-1.5 text-[10px] font-bold text-slate-500 border-t-2 border-slate-200">
                                    {c.label} — {DEPTH_DESC[c.label]}
                                  </td>
                                </tr>
                                {catItems.map(item => {
                                  const statusBadge = c.isD3
                                    ? (item.accuracy_score >= 80 ? { text: "정확 인용", cls: "bg-blue-50 text-blue-600" }
                                      : item.accuracy_score >= 50 ? { text: "일부 불일치", cls: "bg-amber-50 text-amber-600" }
                                      : { text: "수치 부정확", cls: "bg-red-50 text-red-600" })
                                    : (item.mentioned ? { text: "노출", cls: "bg-emerald-50 text-emerald-600" } : { text: "미노출", cls: "bg-red-50 text-red-600" });
                                  return (
                                    <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50">
                                      <td className="px-3 py-2 text-[10px] text-slate-400">{c.label}</td>
                                      <td className="px-3 py-2 text-slate-700">{item.prompt_text}</td>
                                      <td className="px-3 py-2 text-center">
                                        {c.isD3
                                          ? <span className={cn("font-semibold", item.accuracy_score >= 50 ? "text-blue-600" : "text-red-500")}>{item.accuracy_score}%</span>
                                          : item.mentioned ? <span className="text-emerald-500">✓</span> : <span className="text-red-500">✗</span>}
                                      </td>
                                      <td className="px-3 py-2 text-center">
                                        {c.isD3
                                          ? (item.accuracy_score >= 50 ? <span className="text-emerald-500">✓</span> : <span className="text-amber-500">△</span>)
                                          : <span className="text-slate-300">—</span>}
                                      </td>
                                      <td className="px-3 py-2 text-center">
                                        <span className={cn("inline-block text-[10px] font-semibold px-2 py-0.5 rounded", statusBadge.cls)}>{statusBadge.text}</span>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}

              {/* 대화 목록 */}
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
                          <span className="text-xs font-bold text-blue-600 uppercase tracking-wide bg-blue-50 px-2.5 py-1 rounded">{getUsedCategories(accuracyItems).find(c => c.startsWith("D3")) ?? "D3"}</span>
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
        <TrendDetailModal runs={regularRuns} beforeRun={beforeRuns[0] ?? null} prompts={prompts} brandName={selectedBrand.name} getRunStats={getRunStats} onClose={() => setTrendDetailOpen(false)} onDownloadMonthly={downloadMonthlyReport} />
      )}

      {/* 프롬프트 추가 모달 */}
      <AddPromptModal open={addPromptOpen} onClose={() => setAddPromptOpen(false)} brandId={selectedBrand.id} brandName={selectedBrand.name}
        onCreated={(p) => { setPrompts(prev => [...prev, p]); setAddPromptOpen(false); }} />
    </div>
  );
}

function EditBrandModal({ brand, onClose, onSaved }: { brand: Brand; onClose: () => void; onSaved: (b: { id: string; name: string; landing_url?: string; fact_data?: Brand["fact_data"] }) => void }) {
  const [name] = useState(brand.name);
  const [url, setUrl] = useState(brand.landing_url ?? "");
  const [plan, setPlan] = useState<BrandPlan>(getBrandPlan(brand));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const save = async () => {
    setSaving(true);
    // fact_data에서 기존 plan 제거 후 새로 추가
    const currentFd = (brand.fact_data && Array.isArray(brand.fact_data)) ? brand.fact_data.filter((d: { label: string }) => d.label !== "__brand_plan__") : [];
    const newFd = [...currentFd, { keyword: JSON.stringify(plan), label: "__brand_plan__" }];
    await fetch("/api/geo/brands", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: brand.id, landing_url: url.trim() || undefined, fact_data: newFd }) });
    onSaved({ id: brand.id, name, landing_url: url.trim() || undefined, fact_data: newFd as Brand["fact_data"] });
    setSaving(false);
  };
  const groups = [...new Set(PLAN_LABELS.map(p => p.group))];
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>브랜드 수정</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">브랜드명</Label>
            <Input className="mt-1" value={name} disabled />
          </div>
          <div>
            <Label className="text-xs">랜딩 URL</Label>
            <Input className="mt-1" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..." />
          </div>
          <div>
            <Label className="text-xs">운영 플랜</Label>
            {groups.map(g => (
              <div key={g} className="mt-2">
                <p className="text-[10px] text-slate-500 font-semibold mb-1">{g}</p>
                <div className="flex flex-wrap gap-1.5">
                  {PLAN_LABELS.filter(p => p.group === g).map(p => (
                    <label key={p.key} className={cn("flex items-center gap-1 text-xs px-2 py-1 rounded-lg border cursor-pointer transition-colors",
                      plan[p.key] ? "bg-slate-900 text-white border-slate-900" : "border-slate-200 text-slate-500 hover:bg-slate-50"
                    )}>
                      <input type="checkbox" checked={plan[p.key]} onChange={e => setPlan({ ...plan, [p.key]: e.target.checked })} className="hidden" />
                      {p.label}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div>
            <Label className="text-xs">자동 실행 시간</Label>
            <div className="flex items-center gap-2 mt-1">
              <input type="time" value={plan.auto_time ?? "09:00"} onChange={e => setPlan({ ...plan, auto_time: e.target.value })}
                className="text-sm border rounded-md px-2 py-1 outline-none focus:ring-2 focus:ring-blue-500" />
              <span className="text-[10px] text-slate-400">자동화 ON 시 이 시간에 실행</span>
            </div>
          </div>
        </div>
        <DialogFooter className="mt-2 flex justify-between">
          <button onClick={async () => {
            const input = prompt(`"${brand.name}" 브랜드를 삭제하려면 브랜드명을 정확히 입력하세요.\n(모든 체크 기록, 프롬프트, 키워드가 삭제됩니다)`);
            if (input !== brand.name) { if (input !== null) alert("브랜드명이 일치하지 않습니다."); return; }
            setDeleting(true);
            await fetch(`/api/geo/brands?id=${brand.id}`, { method: "DELETE" });
            window.location.reload();
          }} className="text-xs text-red-500 hover:text-red-700">{deleting ? "삭제 중..." : "브랜드 삭제"}</button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>취소</Button>
            <Button onClick={save} disabled={saving}>{saving ? "저장 중..." : "저장"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddBrandModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (b: Brand, day?: string) => void }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [day, setDay] = useState("");
  const [plan, setPlan] = useState<BrandPlan>({ ...DEFAULT_PLAN });
  const [saving, setSaving] = useState(false);
  const groups = [...new Set(PLAN_LABELS.map(p => p.group))];
  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const res = await fetch("/api/geo/brands", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim(), landing_url: url.trim() || undefined }) });
    if (res.ok) {
      const b = await res.json();
      // 플랜 저장
      await fetch("/api/geo/brands", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: b.id, fact_data: [{ keyword: JSON.stringify(plan), label: "__brand_plan__" }] }) });
      b.fact_data = [{ keyword: JSON.stringify(plan), label: "__brand_plan__" }];
      onCreated(b, day || undefined);
      setName(""); setUrl(""); setDay(""); setPlan({ ...DEFAULT_PLAN });
    }
    setSaving(false);
  };
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>브랜드 추가</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs">브랜드명 *</Label><Input className="mt-1" value={name} onChange={e => setName(e.target.value)} placeholder="오공김밥" /></div>
          <div><Label className="text-xs">랜딩 URL</Label><Input className="mt-1" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..." /></div>
          <div>
            <Label className="text-xs">관리 요일</Label>
            <div className="flex gap-1.5 mt-1">
              {["월", "화", "수", "목", "금"].map(d => (
                <button key={d} onClick={() => setDay(day === d ? "" : d)}
                  className={cn("flex-1 text-xs py-1.5 rounded-lg border transition-colors",
                    day === d ? "bg-slate-900 text-white border-slate-900" : "border-slate-200 text-slate-500 hover:bg-slate-50"
                  )}>{d}</button>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-xs">운영 플랜</Label>
            {groups.map(g => (
              <div key={g} className="mt-2">
                <p className="text-[10px] text-slate-500 font-semibold mb-1">{g}</p>
                <div className="flex flex-wrap gap-1.5">
                  {PLAN_LABELS.filter(p => p.group === g).map(p => (
                    <label key={p.key} className={cn("flex items-center gap-1 text-xs px-2 py-1 rounded-lg border cursor-pointer transition-colors",
                      plan[p.key] ? "bg-slate-900 text-white border-slate-900" : "border-slate-200 text-slate-500 hover:bg-slate-50"
                    )}>
                      <input type="checkbox" checked={plan[p.key]} onChange={e => setPlan({ ...plan, [p.key]: e.target.checked })} className="hidden" />
                      {p.label}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button onClick={save} disabled={saving || !name.trim()}>{saving ? "저장 중..." : "추가"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddPromptModal({ open, onClose, brandId, brandName, onCreated }: { open: boolean; onClose: () => void; brandId: string; brandName: string; onCreated: (p: Prompt) => void }) {
  const [text, setText] = useState("");
  const [depthKey, setDepthKey] = useState("D0");
  const [d2Custom, setD2Custom] = useState("");
  const [saving, setSaving] = useState(false);

  const depthOptions = [
    { key: "D0", label: "D0 — 개인창업 탐색 (노출률)" },
    { key: "D1", label: "D1 — 프랜차이즈 탐색 (노출률)" },
    { key: "D2", label: "D2 — 카테고리 지정 (노출률)" },
    { key: "D3", label: "D3 — 브랜드 직접 질문 (정확도)" },
  ];

  const getCategory = () => {
    if (depthKey === "D0") return "D0 개인창업 탐색";
    if (depthKey === "D1") return "D1 프랜차이즈 탐색";
    if (depthKey === "D2") return `D2 ${d2Custom.trim() || "카테고리"}`;
    return `D3 ${brandName} 직접`;
  };

  const save = async () => {
    if (!text.trim()) return;
    if (depthKey === "D2" && !d2Custom.trim()) return;
    setSaving(true);
    const category = getCategory();
    const res = await fetch("/api/geo/prompts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brand_id: brandId, prompt_text: text.trim(), category }) });
    if (res.ok) { const p = await res.json(); onCreated(p); setText(""); }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>프롬프트 추가</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">카테고리 *</Label>
            <select value={depthKey} onChange={e => setDepthKey(e.target.value)}
              className="mt-1 w-full text-sm border rounded-md px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500">
              {depthOptions.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </div>
          {depthKey === "D2" && (
            <div>
              <Label className="text-xs">체크 카테고리명 *</Label>
              <Input className="mt-1" value={d2Custom} onChange={e => setD2Custom(e.target.value)} placeholder="예: 김밥, 치킨, 분식, 피자 등" />
              <p className="text-[10px] text-slate-400 mt-1">해당 카테고리에서 브랜드가 노출되는지 체크합니다</p>
            </div>
          )}
          <div><Label className="text-xs">프롬프트 *</Label><Input className="mt-1" value={text} onChange={e => setText(e.target.value)} placeholder="김밥 프랜차이즈 창업 추천해줘" /></div>
          <div className="text-xs text-slate-400 bg-slate-50 rounded-lg p-2">
            {depthKey === "D3"
              ? "브랜드명을 직접 넣는 질문. AI 답변의 정확도를 체크합니다."
              : depthKey === "D2"
              ? `"${d2Custom || '___'}" 카테고리에서 브랜드가 언급되는지 체크합니다.`
              : "브랜드명 없이 일반적으로 질문. AI가 브랜드를 언급하는지 체크합니다."}
          </div>
        </div>
        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button onClick={save} disabled={saving || !text.trim() || (depthKey === "D2" && !d2Custom.trim())}>{saving ? "저장 중..." : "추가"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChatBubble({ item, type }: { item: CheckItem; type: "exposure" | "accuracy" }) {
  const tag = type === "exposure"
    ? (item.mentioned
      ? <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full"><CheckCircle2 className="h-3 w-3" />노출</span>
      : <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-500 bg-red-50 px-2 py-0.5 rounded-full"><XCircle className="h-3 w-3" />브랜드 미노출</span>)
    : <span className={cn("inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full",
        item.accuracy_score >= 50 ? "text-blue-600 bg-blue-50" : "text-red-500 bg-red-50")}>
        {item.accuracy_score}%
      </span>;

  return (
    <div className="space-y-3">
      {/* 사용자 질문 + 태그 */}
      <div className="flex items-center justify-end gap-2">
        {tag}
        <div className="max-w-[85%] sm:max-w-[75%] bg-blue-500 text-white rounded-2xl rounded-br-md px-3 sm:px-4 py-2 sm:py-2.5">
          <p className="text-xs sm:text-sm">{item.prompt_text}</p>
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

function TrendDetailModal({ runs, beforeRun, prompts, brandName, getRunStats, onClose, onDownloadMonthly }: {
  runs: CheckRun[]; beforeRun: CheckRun | null; prompts: Prompt[]; brandName: string;
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
      <DialogContent className="max-w-5xl w-[calc(100vw-1rem)] sm:w-auto max-h-[95vh] sm:max-h-[90vh] p-0 overflow-hidden">
        <div className="px-3 sm:px-5 py-3 border-b border-slate-200 bg-white sticky top-0 z-10">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <DialogHeader className="p-0">
              <DialogTitle className="text-sm sm:text-base">{brandName} — 추이 상세</DialogTitle>
            </DialogHeader>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
                {monthKeys.map(m => (
                  <button key={m} onClick={() => setSelMonth(m)}
                    className={cn("px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0",
                      m === selMonth ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                    )}>{m}</button>
                ))}
              </div>
              <button onClick={() => onDownloadMonthly(selMonth)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 shrink-0" title="월간 리포트 다운로드">
                <Download className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-auto p-3 sm:p-5" style={{ maxHeight: "calc(95vh - 80px)" }}>
          {/* 월 요약 */}
          <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-6">
            {monthRuns.length > 0 && (() => {
              const latest = monthRuns[monthRuns.length - 1];
              const first = monthRuns[0];
              const latestSt = getRunStats(latest);
              const firstSt = getRunStats(first);
              const expDiff = latestSt.expScore - firstSt.expScore;
              const accDiff = latestSt.avgAcc - firstSt.avgAcc;
              return (
                <>
                  <div className="bg-emerald-50 rounded-lg p-3 sm:p-4 text-center">
                    <p className="text-[10px] text-emerald-600 font-semibold uppercase">노출률</p>
                    <p className="text-xl sm:text-2xl font-bold text-emerald-700">{latestSt.expScore}%</p>
                    {monthRuns.length > 1 && <p className={cn("text-[10px] sm:text-xs font-semibold", expDiff >= 0 ? "text-emerald-600" : "text-red-500")}>{expDiff >= 0 ? "+" : ""}{expDiff}%p</p>}
                  </div>
                  <div className="bg-blue-50 rounded-lg p-3 sm:p-4 text-center">
                    <p className="text-[10px] text-blue-600 font-semibold uppercase">정확도</p>
                    <p className="text-xl sm:text-2xl font-bold text-blue-700">{latestSt.avgAcc}%</p>
                    {monthRuns.length > 1 && <p className={cn("text-[10px] sm:text-xs font-semibold", accDiff >= 0 ? "text-blue-600" : "text-red-500")}>{accDiff >= 0 ? "+" : ""}{accDiff}%p</p>}
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3 sm:p-4 text-center">
                    <p className="text-[10px] text-slate-500 font-semibold uppercase">체크</p>
                    <p className="text-xl sm:text-2xl font-bold text-slate-700">{monthRuns.length}</p>
                    <p className="text-[10px] sm:text-xs text-slate-400">이번 달</p>
                  </div>
                </>
              );
            })()}
          </div>

          {/* 꺾은선 그래프 (BEFORE 포함) */}
          {(() => {
            const chartRuns = [...(beforeRun ? [beforeRun] : []), ...monthRuns];
            if (chartRuns.length < 2) return null;
            const chartLabels = chartRuns.map((r, i) => i === 0 && beforeRun ? "BF" : r.run_date.slice(5));
            return (
              <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-lg border border-slate-200 p-4">
                  <MiniLineChart data={chartRuns.map(r => getRunStats(r).expScore)} labels={chartLabels} color="#10b981" label="노출률 (D0~D2)" />
                </div>
                <div className="rounded-lg border border-slate-200 p-4">
                  <MiniLineChart data={chartRuns.map(r => getRunStats(r).avgAcc)} labels={chartLabels} color="#3b82f6" label="정확도 (D3)" />
                </div>
              </div>
            );
          })()}

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
