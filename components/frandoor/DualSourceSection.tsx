"use client";

import { useEffect, useState, useCallback } from "react";
import { Upload, FileText, Search, GitCompareArrows } from "lucide-react";
import type { FactRecord, FactDiff } from "@/types/factSchema";

type Brand = { id: string; name: string };

type SourceDoc = { file_name: string; uploaded_at: string; markdown_chars: number };

export default function DualSourceSection({ brand }: { brand: Brand }) {
  const [sourceDoc, setSourceDoc] = useState<SourceDoc | null>(null);
  const [facts, setFacts] = useState<FactRecord[]>([]);
  const [diffs, setDiffs] = useState<FactDiff[]>([]);
  const [busy, setBusy] = useState<string>("");

  const reload = useCallback(async () => {
    try {
      const res = await fetch(`/api/brands/${brand.id}/dual-source-state`);
      if (!res.ok) return;
      const data = await res.json();
      setSourceDoc(data.source_doc);
      setFacts(data.facts ?? []);
      setDiffs(data.diffs ?? []);
    } catch { /* ignore */ }
  }, [brand.id]);

  useEffect(() => { reload(); }, [reload]);

  const docxFacts = facts.filter(f => f.provenance === "docx");
  const publicFacts = facts.filter(f => f.provenance === "public_fetch");

  const uploadDocx = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".docx")) { alert("docx 파일만 업로드 가능"); return; }
    setBusy("docx 업로드 중...");
    try {
      const { createClient } = await import("@/utils/supabase/client");
      const sb = createClient();
      const storagePath = `brand-docx/${brand.id}/${Date.now()}_${file.name}`;
      const { data: signedData, error: signErr } = await sb.storage.from("documents").createSignedUploadUrl(storagePath);
      if (signErr || !signedData) throw new Error("업로드 준비 실패");
      const { error: upErr } = await sb.storage.from("documents").uploadToSignedUrl(storagePath, signedData.token, file, { contentType: file.type || "application/octet-stream" });
      if (upErr) throw new Error("업로드 실패");
      const { data: u } = sb.storage.from("documents").getPublicUrl(storagePath);
      const res = await fetch(`/api/brands/${brand.id}/upload-fact-doc`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_url: u.publicUrl, file_name: file.name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "업로드 실패");
      alert(data.unchanged ? "동일한 파일 — 스킵됨" : `docx 업로드 완료 (markdown ${data.markdown_chars}자)`);
      await reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "업로드 실패");
    } finally {
      setBusy("");
    }
  };

  const extractFacts = async () => {
    setBusy("docx 팩트 추출 중...");
    try {
      const res = await fetch(`/api/brands/${brand.id}/extract-facts`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "추출 실패");
      alert(`docx 팩트 ${data.facts_count}개 추출 완료`);
      await reload();
    } catch (e) { alert(e instanceof Error ? e.message : "실패"); }
    finally { setBusy(""); }
  };

  // v4-15: 팩트 추출 → step1 facts-a → step2 facts-c → step3 write 자동 chain.
  // 사용자 클릭 1회 ≈ 75s 후 본문 완성.
  const extractFactsAndGenerate = async () => {
    try {
      // 1/4 — extract-facts
      setBusy("1/4 docx 팩트 추출 중... (~10s)");
      const extractRes = await fetch(`/api/brands/${brand.id}/extract-facts`, { method: "POST" });
      const extractData = await extractRes.json();
      if (!extractRes.ok) throw new Error(extractData.error ?? "추출 실패");
      await reload();

      const brandLabel = (extractData.brand_label as string | undefined) ?? brand.name;
      const industry = (extractData.industry as string | null | undefined) ?? "프랜차이즈";
      const topic = `${brandLabel} ${industry} 프랜차이즈 평균 비교: 창업비용·매출·가맹점 데이터`;

      // 2/4 — step1 facts-a
      setBusy("2/4 분포 데이터 분석 중... (~10s)");
      const s1Res = await fetch(`/api/geo/facts-a`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand_id: brand.id, topic, channel: "frandoor" }),
      });
      const s1Data = await s1Res.json();
      if (!s1Res.ok) {
        if (s1Data.error === "FTC_BRAND_ID_MISSING") {
          setBusy("");
          alert(
            `이 브랜드는 ftc_brand_id 매핑이 필요합니다 (관리자에게 문의).\n팩트는 ${extractData.facts_count}개 추출됐지만 본문 생성은 skip 됐어요.`,
          );
          return;
        }
        throw new Error(s1Data.message ?? s1Data.error ?? "step1 실패");
      }
      const draftId = s1Data.draftId as string;
      if (!draftId) throw new Error("step1 응답에 draftId 누락");

      // 3/4 — step2 facts-c
      setBusy("3/4 본사 데이터 매칭 중... (~5s)");
      const s2Res = await fetch(`/api/geo/facts-c/${draftId}`, { method: "POST" });
      if (!s2Res.ok) {
        const e2 = await s2Res.json().catch(() => ({}));
        throw new Error(e2.message ?? e2.error ?? "step2 실패");
      }

      // 4/4 — step3 write
      setBusy("4/4 본문 생성 중... (~50s, 잠시만 기다려주세요)");
      const s3Res = await fetch(`/api/geo/write/${draftId}`, { method: "POST" });
      const s3Data = await s3Res.json().catch(() => ({}));
      if (!s3Res.ok) throw new Error(s3Data.message ?? s3Data.error ?? "step3 실패");

      // 완료
      setBusy("");
      const confirmGo = window.confirm(
        `✓ 팩트 ${extractData.facts_count}개 추출 + 본문 생성 완료\n작성된 글로 이동할까요?`,
      );
      if (confirmGo) {
        window.location.href = `/content/posts/${draftId}`;
      }
    } catch (e) {
      setBusy("");
      alert(`실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const fetchPublic = async () => {
    setBusy("공정위 수치 수집 중...");
    try {
      const res = await fetch(`/api/brands/${brand.id}/fetch-public-facts`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "실패");
      alert(`public 팩트 ${data.facts_count}개 수집 (화이트리스트 외 ${data.dropped_non_whitelist ?? 0}건 드롭)`);
      await reload();
    } catch (e) { alert(e instanceof Error ? e.message : "실패"); }
    finally { setBusy(""); }
  };

  const computeDiffs = async () => {
    setBusy("차이 분석 중...");
    try {
      const res = await fetch(`/api/brands/${brand.id}/compute-diffs`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "실패");
      alert(`차이 ${data.diffs_count}개 분석 완료 (cleared ${data.cleared ?? 0})`);
      await reload();
    } catch (e) { alert(e instanceof Error ? e.message : "실패"); }
    finally { setBusy(""); }
  };

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/30 p-5">
      <h2 className="text-sm font-semibold text-slate-700 mb-1">
        <FileText className="h-4 w-4 inline mr-1 text-violet-500" />팩트 이중 소스 (신규)
      </h2>
      <p className="text-xs text-slate-500 mb-3">docx 1개 + 공정위/정부 공개 자료 자동 수집. 두 소스 수치가 다르면 자동 분석 섹션 생성.</p>

      {/* 1단계: docx 업로드 */}
      <div className="mb-3 p-2.5 rounded-md bg-white border border-slate-200">
        <p className="text-[11px] text-slate-500 mb-1.5">1단계: 담당자 docx 업로드 (브랜드당 1개)</p>
        <label className="cursor-pointer inline-block">
          <input type="file" accept=".docx" className="hidden" onChange={e => {
            const f = e.target.files?.[0];
            if (f) uploadDocx(f);
            e.target.value = "";
          }} />
          <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border border-violet-300 bg-white hover:bg-violet-50 text-violet-600">
            <Upload className="h-3 w-3" />docx 업로드
          </span>
        </label>
        {sourceDoc ? (
          <p className="mt-1.5 text-[10px] text-emerald-600">
            ✓ {sourceDoc.file_name} ({sourceDoc.markdown_chars?.toLocaleString() ?? "?"}자) · {sourceDoc.uploaded_at?.slice(0, 10)}
          </p>
        ) : <p className="mt-1.5 text-[10px] text-slate-400">업로드된 docx 없음</p>}
        {sourceDoc && (
          <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
            <button onClick={extractFactsAndGenerate} disabled={!!busy}
              className="text-[10px] px-2 py-0.5 rounded bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50">
              팩트 추출 + 본문 자동 생성
            </button>
            <button onClick={extractFacts} disabled={!!busy}
              className="text-[10px] px-2 py-0.5 rounded bg-violet-100 text-violet-700 hover:bg-violet-200 disabled:opacity-50">
              팩트만 추출
            </button>
          </div>
        )}
      </div>

      {/* 2단계: public fetch */}
      <div className="mb-3 p-2.5 rounded-md bg-white border border-slate-200">
        <p className="text-[11px] text-slate-500 mb-1.5">2단계: 공정위·통계청 공개 자료 수집</p>
        <button onClick={fetchPublic} disabled={!!busy}
          className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-50">
          <Search className="h-3 w-3" />공정위 수치 수집
        </button>
        <p className="mt-1.5 text-[10px] text-slate-400">수집됨: {publicFacts.length}건 · docx: {docxFacts.length}건</p>
      </div>

      {/* 3단계: diff */}
      <div className="mb-3 p-2.5 rounded-md bg-white border border-slate-200">
        <p className="text-[11px] text-slate-500 mb-1.5">3단계: 두 소스 차이 분석</p>
        <button onClick={computeDiffs} disabled={!!busy || docxFacts.length === 0 || publicFacts.length === 0}
          className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border border-amber-300 bg-white hover:bg-amber-50 text-amber-700 disabled:opacity-50">
          <GitCompareArrows className="h-3 w-3" />차이 분석 실행
        </button>
        <p className="mt-1.5 text-[10px] text-slate-400">차이: {diffs.length}건 (5% 이상)</p>
      </div>

      {busy && <p className="text-[11px] text-violet-600 animate-pulse mb-2">{busy}</p>}

      {/* 팩트 리스트 */}
      {facts.length > 0 && (
        <details className="mb-2">
          <summary className="text-[11px] text-slate-600 cursor-pointer font-medium">📋 팩트 {facts.length}건 (docx {docxFacts.length} / public {publicFacts.length})</summary>
          <div className="mt-1.5 max-h-60 overflow-y-auto space-y-0.5 text-[10px]">
            {facts.map(f => (
              <div key={f.id} className="flex items-center gap-1 py-0.5 border-b border-slate-100">
                <span className={`px-1 rounded text-white text-[9px] ${f.provenance === "docx" ? "bg-violet-400" : "bg-sky-400"}`}>
                  {f.provenance === "docx" ? "D" : "P"}
                </span>
                <span className="font-medium w-24 truncate">{f.label}</span>
                <span className="flex-1 truncate">{f.value}</span>
                <span className="text-slate-400 text-[9px]">{f.source_type}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* diff 미리보기 */}
      {diffs.length > 0 && (
        <details open>
          <summary className="text-[11px] text-amber-700 cursor-pointer font-medium">⚠ 차이 분석 {diffs.length}건</summary>
          <div className="mt-1.5 space-y-2">
            {diffs.map(d => (
              <div key={d.id ?? d.label} className="p-2 rounded bg-amber-50 border border-amber-200 text-[10px]">
                <div className="font-semibold text-amber-800 mb-1">{d.label} · 차이율 {(d.diff_ratio * 100).toFixed(1)}%</div>
                <div className="text-slate-600">• {d.docx_source_type}: {d.docx_value}{d.docx_note && ` (${d.docx_note})`}</div>
                <div className="text-slate-600">• {d.public_source_type}: {d.public_value}{d.public_note && ` (${d.public_note})`}</div>
                <div className="mt-1 text-slate-700 leading-relaxed">{d.diff_reason}</div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
