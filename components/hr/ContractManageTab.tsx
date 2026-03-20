"use client";

import { useState, useEffect, useRef } from "react";
import { FileText, Loader2, ChevronRight, PenLine, FileDown, X } from "lucide-react";
import { CONTRACT_TYPE_LABELS } from "@/lib/contractForms";
import { ContractDocument, A4Page } from "@/lib/contractTemplates";
import type { ContractRow } from "@/types/contract";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

export function ContractManageTab() {
  const [list, setList] = useState<ContractRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableMissingMessage, setTableMissingMessage] = useState<string | null>(null);
  const [selectedContract, setSelectedContract] = useState<ContractRow | null>(null);
  const [signing, setSigning] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [toast, setToast] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const fetchList = () => {
    setTableMissingMessage(null);
    fetch("/api/contracts/me")
      .then(async (r) => {
        const data = await r.json();
        if (r.status === 503 && data?.code === "CONTRACTS_TABLE_MISSING") {
          setTableMissingMessage(data?.error ?? "contracts 테이블을 먼저 생성해 주세요.");
          return [];
        }
        return Array.isArray(data) ? data : [];
      })
      .then(setList)
      .catch(() => setList([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchList();
  }, []);

  const handleSign = async () => {
    if (!selectedContract || selectedContract.status === "signed") return;
    setSigning(true);
    try {
      const res = await fetch(`/api/contracts/${selectedContract.id}`, { method: "PATCH" });
      if (!res.ok) throw new Error("서명 처리 실패");
      const updated = await res.json();
      setSelectedContract(updated);
      setToast(true);
      setTimeout(() => setToast(false), 2000);
      fetchList();
    } catch {
      alert("서명 처리에 실패했습니다.");
    } finally {
      setSigning(false);
    }
  };

  const handlePdfDownload = async () => {
    if (!printRef.current || !selectedContract) return;
    setPdfLoading(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);
      const canvas = await html2canvas(printRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
      });
      const imgData = canvas.toDataURL("image/png");
      const doc = new jsPDF("p", "mm", "a4");
      const pdfW = doc.internal.pageSize.getWidth();
      const pdfH = doc.internal.pageSize.getHeight();
      doc.addImage(imgData, "PNG", 0, 0, pdfW, pdfH);
      const safeName = (selectedContract.content as { employeeName?: string })?.employeeName ?? "계약서";
      const datePart = new Date().toISOString().slice(0, 10);
      doc.save(`계약서_${safeName}_${datePart}.pdf`);
    } catch (e) {
      console.error(e);
      window.print();
    } finally {
      setPdfLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="mb-6 flex items-center gap-2 text-xl font-semibold text-slate-800">
        <FileText className="size-6" />
        계약서 관리
      </h2>
      <p className="mb-4 text-sm text-slate-600">
        C레벨이 발송한 계약서를 확인하고 서명하거나, 서명 완료된 계약서를 PDF로 다운로드할 수 있습니다.
      </p>

      {tableMissingMessage ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center text-amber-800">
          <p className="font-medium">계약서를 사용하려면 DB 설정이 필요합니다.</p>
          <p className="mt-2 text-sm">{tableMissingMessage}</p>
        </div>
      ) : list.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-600">
          <p>발송된 계약서가 없습니다.</p>
          <p className="mt-1 text-sm">C레벨이 발송한 계약서가 여기에 표시됩니다.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {list.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setSelectedContract(c)}
                className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-slate-300 hover:shadow"
              >
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-slate-100">
                    <FileText className="size-5 text-slate-600" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-800">
                      {CONTRACT_TYPE_LABELS[c.contract_type as keyof typeof CONTRACT_TYPE_LABELS]}
                    </p>
                    <p className="text-sm text-slate-500">
                      발송일 {format(new Date(c.created_at), "yyyy.MM.dd", { locale: ko })}
                      {c.status === "signed" && " · 서명 완료"}
                    </p>
                  </div>
                </div>
                <ChevronRight className="size-5 text-slate-400" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* 계약서 상세 모달: 서명 / PDF 다운로드 */}
      {selectedContract && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setSelectedContract(null)}
          role="dialog"
          aria-modal="true"
          aria-label="계약서 상세"
        >
          <div
            className="flex max-h-[90vh] w-full max-w-[900px] flex-col rounded-xl border border-slate-200 bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3">
              <h4 className="font-semibold text-slate-800">
                {CONTRACT_TYPE_LABELS[selectedContract.contract_type as keyof typeof CONTRACT_TYPE_LABELS]}
                <span className="ml-2 text-sm font-normal text-slate-500">
                  {format(new Date(selectedContract.created_at), "yyyy.MM.dd", { locale: ko })}
                </span>
              </h4>
              <button
                type="button"
                onClick={() => setSelectedContract(null)}
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                aria-label="닫기"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div ref={printRef} className="print:border-0">
                <A4Page>
                  <ContractDocument contract={selectedContract} />
                </A4Page>
              </div>
              <div className="mt-4 flex flex-col gap-2 print:hidden">
                {selectedContract.status !== "signed" ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-center">
                    <p className="mb-2 text-sm text-amber-800">위 계약 내용에 동의하며 전자서명합니다</p>
                    <button
                      type="button"
                      onClick={handleSign}
                      disabled={signing}
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-800 py-2.5 text-white hover:bg-slate-900 disabled:opacity-60"
                    >
                      {signing ? <Loader2 className="size-5 animate-spin" /> : <PenLine className="size-5" />}
                      전자서명하기
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handlePdfDownload}
                    disabled={pdfLoading}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white py-2.5 text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    {pdfLoading ? <Loader2 className="size-5 animate-spin" /> : <FileDown className="size-5" />}
                    PDF로 다운로드
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 shadow-lg">
          ✅ 성공적으로 서명되었습니다.
        </div>
      )}
    </div>
  );
}
