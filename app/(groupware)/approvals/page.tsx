"use client";

import { useState, useEffect, useCallback } from "react";
import { format, parseISO } from "date-fns";
import { ko } from "date-fns/locale";
import { Plus, X, Check, ChevronDown, ChevronLeft, ChevronRight, Loader2, FileText, Clock, CheckCircle2, XCircle, Paperclip, Trash2 } from "lucide-react";
import { uploadApprovalAttachment } from "@/utils/supabase/storage";
import { cn } from "@/lib/utils";
import { usePermission } from "@/contexts/PermissionContext";

// ─── 타입 ──────────────────────────────────────────────────────────────────────
type Approval = {
  id: string;
  type: string;
  title: string;
  content: string;
  requester_name: string;
  requester_id: string;
  approver_name?: string;
  status: "pending" | "approved" | "rejected";
  reject_reason?: string;
  amount?: number;
  start_date?: string;
  end_date?: string;
  created_at: string;
  reviewed_at?: string;
  // 정산요청 전용
  sheet_classification?: string | null;
  payment_reason?: string | null;
  bank?: string | null;
  account_number?: string | null;
  account_holder_name?: string | null;
  attachment_note?: string | null;
  // 비품구입 전용
  purchase_url?: string | null;
  purchase_id?: string | null;
  purchase_password?: string | null;
  item_name?: string | null;
  purpose?: string | null;
  // 결재선 위계
  approval_stage?: string | null;
  first_approver_name?: string | null;
  first_approved_at?: string | null;
  // 원장 카테고리
  ledger_category?: string | null;
};

const APPROVAL_TYPES = [
  { value: "expense",  label: "정산요청",   icon: "💳" },
  { value: "purchase", label: "비품구입",   icon: "🛒" },
  { value: "invoice",  label: "청구발행",   icon: "🧾" },
  { value: "etc",      label: "기타",       icon: "📄" },
];

/** 원장 카테고리 (finance 페이지 CLASSIFICATION_OPTIONS와 동일) */
const LEDGER_CATEGORY_OPTIONS = [
  "더널리", "더널리 충전", "티제이웹", "기타",
  "매체비정산", "CPC정산", "환불(더널리)", "환불(티제이웹)",
];

/** 정산요청 시트 분류 (하위 구분) */
const SETTLEMENT_SHEET_OPTIONS = [
  { value: "결제", label: "결제" },
  { value: "정산", label: "정산" },
  { value: "환불", label: "환불" },
  { value: "슬롯구입정산", label: "슬롯구입정산" },
  { value: "CPC리워드", label: "CPC리워드" },
];

const STATUS_CONFIG = {
  pending:  { label: "승인 대기", icon: Clock,          cls: "bg-amber-100 text-amber-700" },
  approved: { label: "승인 완료", icon: CheckCircle2,   cls: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "반려",      icon: XCircle,        cls: "bg-rose-100 text-rose-700" },
};

function getStatusLabel(a: Approval) {
  if (a.status === "pending" && (a as unknown as Record<string, unknown>).approval_stage === "팀장승인완료") {
    return { label: "팀장승인 (C레벨 대기)", icon: Clock, cls: "bg-blue-100 text-blue-700" };
  }
  return STATUS_CONFIG[a.status];
}

const TABS = [
  { id: "all",      label: "전체" },
  { id: "pending",  label: "대기" },
  { id: "approved", label: "완료" },
  { id: "rejected", label: "반려" },
  { id: "mine",     label: "내 결재" },
];

/** 탭 내 결재 유형 필터 */
const TYPE_FILTERS = [
  { value: "",         label: "전체 유형" },
  { value: "expense",  label: "💳 정산요청" },
  { value: "purchase", label: "🛒 비품구입" },
  { value: "invoice",  label: "🧾 청구발행" },
  { value: "etc",      label: "📄 기타" },
];

/** 간단 정산 템플릿 (전체 공유, API 저장) */
export type SimpleSettlementTemplate = {
  id: string;
  name: string;
  title: string;
  payment_reason: string;
  sheet_classification: string;
  bank: string;
  account_number: string;
  account_holder_name: string;
  attachment_note: string;
  ledger_category?: string | null;
  created_at?: string;
};

/** 비품구입 템플릿 */
export type PurchaseTemplate = {
  id: string;
  name: string;
  title: string;
  purchase_url: string;
  purchase_id: string;
  purchase_password: string;
  item_name: string;
  purpose: string;
  created_at?: string;
};

export default function ApprovalsPage() {
  const { currentUserId, currentUserName, isCLevel, isTeamLead, isMaster } = usePermission();
  const canApprove = isTeamLead; // 전자결재는 팀장(박재민)만 결재

  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("all");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [monthFilter, setMonthFilter] = useState<string>(() => format(new Date(), "yyyy-MM"));
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;
  const [showForm, setShowForm] = useState(false);
  const [detailItem, setDetailItem] = useState<Approval | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);

  // 폼 (정산요청 / 비품구입 / 청구발행 / 기타)
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const [form, setForm] = useState({
    type: "expense",
    title: "",
    content: "",
    amount: "",
    date: todayStr,
    payment_reason: "",
    sheet_classification: "",
    bank: "",
    account_number: "",
    account_holder_name: "",
    attachment_note: "",
    purchase_url: "",
    purchase_id: "",
    purchase_password: "",
    item_name: "",
    purpose: "",
    ledger_category: "",
    // 청구발행 전용
    invoice_company: "",
    invoice_representative: "",
    invoice_business_number: "",
    invoice_address: "",
    invoice_business_type: "",
    invoice_business_item: "",
    invoice_depositor: "",
    invoice_tax_email: "",
    invoice_item: "",
  });

  // 청구발행 CRM 클라이언트 검색
  type InvoiceClient = { id: string; name: string; representative?: string | null; business_number?: string | null; address?: string | null; business_type?: string | null; business_item?: string | null; aliases?: string[] | null; email?: string | null };
  const [invoiceClients, setInvoiceClients] = useState<InvoiceClient[]>([]);
  const [showInvoiceClientDrop, setShowInvoiceClientDrop] = useState(false);
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  const [showTemplateManage, setShowTemplateManage] = useState(false);
  const [templateList, setTemplateList] = useState<SimpleSettlementTemplate[]>([]);
  const [editingTemplateName, setEditingTemplateName] = useState<{ id: string; name: string } | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");

  const [showPurchaseTemplateManage, setShowPurchaseTemplateManage] = useState(false);
  const [purchaseTemplateList, setPurchaseTemplateList] = useState<PurchaseTemplate[]>([]);
  const [editingPurchaseTemplateName, setEditingPurchaseTemplateName] = useState<{ id: string; name: string } | null>(null);
  const [selectedPurchaseTemplateId, setSelectedPurchaseTemplateId] = useState("");

  const fetchApprovals = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/approvals");
    if (res.ok) setApprovals(await res.json());
    setLoading(false);
  }, []);

  /** 전체 공유 간단 정산 템플릿 목록 조회 (API) */
  const fetchTemplates = useCallback(async (): Promise<SimpleSettlementTemplate[]> => {
    const res = await fetch("/api/approvals/templates");
    const data = await res.json();
    const list = Array.isArray(data) ? data : [];
    setTemplateList(list);
    return list;
  }, []);

  /** 비품구입 템플릿 목록 조회 */
  const fetchPurchaseTemplates = useCallback(async (): Promise<PurchaseTemplate[]> => {
    const res = await fetch("/api/approvals/templates/purchase");
    const data = await res.json();
    const list = Array.isArray(data) ? data : [];
    setPurchaseTemplateList(list);
    return list;
  }, []);

  useEffect(() => { fetchApprovals(); }, [fetchApprovals]);


  const submitForm = async () => {
    if (!form.title.trim()) return;
    setUploading(true);
    let attachmentUrls: string[] = [];
    if (form.type === "expense" && attachmentFiles.length > 0) {
      for (const file of attachmentFiles) {
        const result = await uploadApprovalAttachment(currentUserId, file);
        if ("url" in result) attachmentUrls.push(result.url);
      }
    }
    const typeObj = APPROVAL_TYPES.find((t) => t.value === form.type);
    const payload: Record<string, unknown> = {
      type: form.type,
      title: form.type === "expense" ? form.title.trim() : form.type === "invoice" ? `🧾 ${form.invoice_company.trim() || "청구발행"}` : `${typeObj?.icon ?? ""} ${form.title}`,
      content: form.content,
      requester_name: currentUserName,
      requester_id: currentUserId,
      amount: form.amount ? Number(form.amount.replace(/[^0-9]/g, "")) || null : null,
      finance_date: form.date || todayStr,
      ledger_category: form.ledger_category || null,
    };
    if (form.type === "expense") {
      payload.payment_reason = form.payment_reason.trim() || null;
      payload.sheet_classification = form.sheet_classification || null;
      payload.bank = form.bank.trim() || null;
      payload.account_number = form.account_number.trim() || null;
      payload.account_holder_name = form.account_holder_name.trim() || null;
      const notePart = form.attachment_note.trim() || "";
      const urlPart = attachmentUrls.length > 0 ? attachmentUrls.join("\n") : "";
      payload.attachment_note = [notePart, urlPart].filter(Boolean).join("\n") || null;
    }
    if (form.type === "purchase") {
      payload.purchase_url = form.purchase_url.trim() || null;
      payload.purchase_id = form.purchase_id.trim() || null;
      payload.purchase_password = form.purchase_password.trim() || null;
      payload.item_name = form.item_name.trim() || null;
      payload.purpose = form.purpose.trim() || null;
    }
    if (form.type === "invoice") {
      const invoiceData = {
        company_name: form.invoice_company.trim(),
        representative: form.invoice_representative.trim(),
        business_number: form.invoice_business_number.trim(),
        address: form.invoice_address.trim(),
        business_type: form.invoice_business_type.trim(),
        business_item: form.invoice_business_item.trim(),
        depositor_name: form.invoice_depositor.trim(),
        tax_email: form.invoice_tax_email.trim(),
        item_name: form.invoice_item.trim(),
      };
      payload.content = JSON.stringify(invoiceData);
      payload.title = `🧾 ${form.invoice_company.trim() || "청구발행"}`;
      payload.account_holder_name = form.invoice_depositor.trim() || null;
    }
    const res = await fetch("/api/approvals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setUploading(false);
    const created = await res.json().catch(() => null);
    if (res.ok) {
      setApprovals((p) => [created, ...p]);
      setShowForm(false);
      setForm({
        type: "expense",
        title: "",
        content: "",
        amount: "",
        date: format(new Date(), "yyyy-MM-dd"),
        payment_reason: "",
        sheet_classification: "",
        bank: "",
        account_number: "",
        account_holder_name: "",
        attachment_note: "",
        purchase_url: "",
        purchase_id: "",
        purchase_password: "",
        item_name: "",
        purpose: "",
        ledger_category: "",
        invoice_company: "",
        invoice_representative: "",
        invoice_business_number: "",
        invoice_address: "",
        invoice_business_type: "",
        invoice_business_item: "",
        invoice_depositor: "",
        invoice_tax_email: "",
        invoice_item: "",
      });
      setAttachmentFiles([]);
      if (created?._warning) {
        alert(created._warning);
      }
    } else {
      alert(created?.error || "결재 신청에 실패했습니다. (DB 설정/권한 확인)");
    }
  };

  const updateStatus = async (id: string, status: "approved" | "rejected", reason?: string) => {
    const approver_role = isCLevel ? "C레벨" : isTeamLead ? "팀장" : "사원";
    const res = await fetch(`/api/approvals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status,
        approver_name: currentUserName,
        approver_role,
        reviewed_at: new Date().toISOString(),
        ...(reason ? { reject_reason: reason } : {}),
      }),
    });
    const result = await res.json().catch(() => null);
    if (res.ok) {
      setApprovals((p) => p.map((a) => a.id === id ? result : a));
      setDetailItem(result);
      setShowRejectInput(false);
      setRejectReason("");
    } else {
      alert(result?.error || "처리에 실패했습니다.");
    }
  };

  const handleDeleteApproval = async (id: string) => {
    if (!confirm("이 결재 내역을 삭제할까요? 연결된 원장 항목도 함께 삭제됩니다.")) return;
    const res = await fetch(`/api/approvals/${id}`, { method: "DELETE" });
    if (res.ok) {
      setApprovals((p) => p.filter((a) => a.id !== id));
      setDetailItem(null);
    } else {
      alert("삭제에 실패했습니다.");
    }
  };

  const filtered = approvals.filter((a) => {
    if (tab === "mine" && a.requester_id !== currentUserId) return false;
    if (tab !== "mine" && tab !== "all" && a.status !== tab) return false;
    if (typeFilter && a.type !== typeFilter) return false;
    if (monthFilter && !a.created_at.startsWith(monthFilter)) return false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const pendingCount = approvals.filter((a) => a.status === "pending").length;

  // 월 목록 생성 (승인 데이터 기준 + 현재 월 항상 포함)
  const availableMonths = Array.from(new Set([
    format(new Date(), "yyyy-MM"),
    ...approvals.map((a) => a.created_at.slice(0, 7)),
  ])).sort().reverse();

  const openNormalForm = async () => {
    await fetchTemplates();
    await fetchPurchaseTemplates();
    // CRM 클라이언트 목록 로드 (청구발행 자동완성용)
    fetch("/api/clients").then((r) => r.json()).then((d) => {
      if (Array.isArray(d)) setInvoiceClients(d);
    }).catch(() => {});
    setForm({
      type: "expense",
      title: "",
      content: "",
      amount: "",
      date: format(new Date(), "yyyy-MM-dd"),
      payment_reason: "",
      sheet_classification: "",
      bank: "",
      account_number: "",
      account_holder_name: "",
      attachment_note: "",
      purchase_url: "",
      purchase_id: "",
      purchase_password: "",
      item_name: "",
      purpose: "",
      ledger_category: "",
      invoice_company: "",
      invoice_representative: "",
      invoice_business_number: "",
      invoice_address: "",
      invoice_business_type: "",
      invoice_business_item: "",
      invoice_depositor: "",
      invoice_tax_email: "",
      invoice_item: "",
    });
    setAttachmentFiles([]);
    setShowForm(true);
  };

  const openReapplyForm = async (a: Approval) => {
    await fetchTemplates();
    await fetchPurchaseTemplates();
    fetch("/api/clients").then((r) => r.json()).then((d) => {
      if (Array.isArray(d)) setInvoiceClients(d);
    }).catch(() => {});
    let inv = { company_name: "", representative: "", business_number: "", address: "", business_type: "", business_item: "", depositor_name: "", tax_email: "", item_name: "" };
    if (a.type === "invoice" && a.content) {
      try { inv = { ...inv, ...JSON.parse(a.content) }; } catch { /* ignore */ }
    }
    setForm({
      type: a.type,
      title: a.title,
      content: a.content ?? "",
      amount: a.amount != null ? String(a.amount) : "",
      payment_reason: a.payment_reason ?? "",
      sheet_classification: a.sheet_classification ?? "",
      bank: a.bank ?? "",
      account_number: a.account_number ?? "",
      account_holder_name: a.account_holder_name ?? "",
      attachment_note: a.attachment_note ?? "",
      purchase_url: a.purchase_url ?? "",
      purchase_id: a.purchase_id ?? "",
      purchase_password: a.purchase_password ?? "",
      item_name: a.item_name ?? "",
      purpose: a.purpose ?? "",
      ledger_category: a.ledger_category ?? "",
      date: format(new Date(), "yyyy-MM-dd"),
      invoice_company: inv.company_name,
      invoice_representative: inv.representative,
      invoice_business_number: inv.business_number,
      invoice_address: inv.address,
      invoice_business_type: inv.business_type,
      invoice_business_item: inv.business_item,
      invoice_depositor: inv.depositor_name,
      invoice_tax_email: inv.tax_email,
      invoice_item: inv.item_name,
    });
    setAttachmentFiles([]);
    setDetailItem(null);
    setShowForm(true);
  };

  const loadTemplateIntoForm = (t: SimpleSettlementTemplate) => {
    setForm((prev) => ({
      ...prev,
      type: "expense",
      title: t.title,
      payment_reason: t.payment_reason,
      sheet_classification: t.sheet_classification,
      bank: t.bank,
      account_number: t.account_number,
      account_holder_name: t.account_holder_name,
      attachment_note: t.attachment_note,
      ledger_category: t.ledger_category ?? "",
      amount: "", // 금액만 비움
    }));
  };

  const loadPurchaseTemplateIntoForm = (t: PurchaseTemplate) => {
    setForm((prev) => ({
      ...prev,
      type: "purchase",
      title: t.title,
      purchase_url: t.purchase_url,
      purchase_id: t.purchase_id,
      purchase_password: t.purchase_password,
      item_name: t.item_name,
      purpose: t.purpose,
      amount: "",
    }));
  };

  const saveAsSimpleTemplate = async () => {
    const name = window.prompt("템플릿 이름을 입력하세요 (예: CPC정산, 슬롯구입정산)", form.title || "정산요청");
    if (name == null || !name.trim()) return;
    const res = await fetch("/api/approvals/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        title: form.title,
        payment_reason: form.payment_reason,
        sheet_classification: form.sheet_classification,
        bank: form.bank,
        account_number: form.account_number,
        account_holder_name: form.account_holder_name,
        attachment_note: form.attachment_note,
        ledger_category: form.ledger_category || null,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err?.error || "저장에 실패했습니다.");
      return;
    }
    await fetchTemplates();
    alert(`"${name.trim()}" 템플릿으로 저장했습니다. 모든 인원이 불러오기에서 사용할 수 있습니다.`);
  };

  const saveAsPurchaseTemplate = async () => {
    const name = window.prompt("비품구입 템플릿 이름을 입력하세요", form.title || "비품구입");
    if (name == null || !name.trim()) return;
    const res = await fetch("/api/approvals/templates/purchase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        title: form.title,
        purchase_url: form.purchase_url,
        purchase_id: form.purchase_id,
        purchase_password: form.purchase_password,
        item_name: form.item_name,
        purpose: form.purpose,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err?.error || "저장에 실패했습니다.");
      return;
    }
    await fetchPurchaseTemplates();
    alert(`"${name.trim()}" 비품구입 템플릿으로 저장했습니다.`);
  };

  const openTemplateManage = async () => {
    setEditingTemplateName(null);
    await fetchTemplates();
    setShowTemplateManage(true);
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm("이 템플릿을 삭제할까요?")) return;
    const res = await fetch(`/api/approvals/templates/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err?.error || "삭제에 실패했습니다.");
      return;
    }
    await fetchTemplates();
  };

  const handleSaveTemplateName = async (id: string, name: string) => {
    if (!name.trim()) return;
    const res = await fetch(`/api/approvals/templates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err?.error || "수정에 실패했습니다.");
      return;
    }
    setEditingTemplateName(null);
    await fetchTemplates();
  };

  const handleDeletePurchaseTemplate = async (id: string) => {
    if (!confirm("이 비품구입 템플릿을 삭제할까요?")) return;
    const res = await fetch(`/api/approvals/templates/purchase/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err?.error || "삭제에 실패했습니다.");
      return;
    }
    await fetchPurchaseTemplates();
  };

  const handleSavePurchaseTemplateName = async (id: string, name: string) => {
    if (!name.trim()) return;
    const res = await fetch(`/api/approvals/templates/purchase/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err?.error || "수정에 실패했습니다.");
      return;
    }
    setEditingPurchaseTemplateName(null);
    await fetchPurchaseTemplates();
  };

  return (
    <div className="flex flex-col gap-5">
      {/* 헤더 */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">전자결재</h1>
          <p className="mt-0.5 text-sm text-slate-500 hidden sm:block">결재 문서를 작성하고 처리하세요. 신청·승인 내역은 아래 리스트에 저장됩니다.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={openTemplateManage}
            className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            📋 <span className="hidden sm:inline">간단 정산</span> 템플릿
          </button>
          <button
            type="button"
            onClick={async () => { await fetchPurchaseTemplates(); setShowPurchaseTemplateManage(true); }}
            className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            🛒 <span className="hidden sm:inline">비품구입</span> 템플릿
          </button>
          <button
            type="button"
            onClick={openNormalForm}
            className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            <Plus className="size-4" /> 결재 신청
          </button>
        </div>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 overflow-x-auto border-b border-slate-200 [-ms-overflow-style:none] [scrollbar-width:none]">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => { setTab(t.id); setPage(1); }}
            className={cn(
              "relative px-4 py-2.5 text-sm font-medium transition-colors",
              tab === t.id ? "text-blue-600 border-b-2 border-blue-600" : "text-slate-500 hover:text-slate-700"
            )}
          >
            {t.label}
            {t.id === "pending" && pendingCount > 0 && (
              <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 월 필터 + 유형 필터 */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => {
            const months = availableMonths;
            const idx = months.indexOf(monthFilter);
            if (idx < months.length - 1) { setMonthFilter(months[idx + 1]!); setPage(1); }
          }} className="flex size-7 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30" disabled={availableMonths.indexOf(monthFilter) >= availableMonths.length - 1}>
            <ChevronLeft className="size-4" />
          </button>
          <select
            value={monthFilter}
            onChange={(e) => { setMonthFilter(e.target.value); setPage(1); }}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-200"
          >
            {availableMonths.map((m) => (
              <option key={m} value={m}>{m.replace("-", "년 ") + "월"}</option>
            ))}
          </select>
          <button type="button" onClick={() => {
            const months = availableMonths;
            const idx = months.indexOf(monthFilter);
            if (idx > 0) { setMonthFilter(months[idx - 1]!); setPage(1); }
          }} className="flex size-7 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30" disabled={availableMonths.indexOf(monthFilter) <= 0}>
            <ChevronRight className="size-4" />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-400">유형:</span>
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.value || "all"}
              type="button"
              onClick={() => { setTypeFilter(f.value); setPage(1); }}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                typeFilter === f.value
                  ? "bg-slate-700 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* 목록 */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="size-6 animate-spin text-slate-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-400">
          <FileText className="size-10 mb-3 opacity-40" />
          <p className="text-sm">결재 문서가 없습니다</p>
        </div>
      ) : (
        <div className="space-y-2">
          {paginated.map((a) => {
            const statusCfg = STATUS_CONFIG[a.status];
            const StatusIcon = statusCfg.icon;
            return (
              <div
                key={a.id}
                onClick={() => setDetailItem(a)}
                className="flex cursor-pointer items-center gap-4 rounded-xl border border-slate-100 bg-white px-5 py-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-slate-800 truncate">{a.title}</p>
                    {a.sheet_classification && (
                      <span className={cn(
                        "shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium",
                        a.sheet_classification === "환불" ? "bg-rose-100 text-rose-700" :
                        a.sheet_classification === "정산" ? "bg-sky-100 text-sky-700" :
                        a.sheet_classification === "결제" ? "bg-violet-100 text-violet-700" :
                        a.sheet_classification === "슬롯구입정산" ? "bg-amber-100 text-amber-700" :
                        "bg-slate-100 text-slate-600"
                      )}>
                        {a.sheet_classification}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {a.requester_name} · {format(parseISO(a.created_at), "M월 d일 HH:mm", { locale: ko })}
                  </p>
                </div>
                {a.amount && (
                  <span className="shrink-0 text-sm font-semibold text-slate-700">
                    {a.amount.toLocaleString()}원
                  </span>
                )}
                <span className={cn("shrink-0 flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold", statusCfg.cls)}>
                  <StatusIcon className="size-3.5" />
                  {statusCfg.label}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1.5">
          <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
            className="flex size-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30">
            <ChevronLeft className="size-4" />
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button key={p} type="button" onClick={() => setPage(p)}
              className={cn("flex size-8 items-center justify-center rounded-lg text-sm font-medium transition-colors",
                page === p ? "bg-slate-800 text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-50"
              )}>
              {p}
            </button>
          ))}
          <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            className="flex size-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30">
            <ChevronRight className="size-4" />
          </button>
        </div>
      )}

      {/* 신청 모달 */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 py-8">
          <div className="w-full max-w-lg max-h-[85vh] flex flex-col rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="shrink-0 flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <h2 className="text-lg font-bold text-slate-900">결재 신청</h2>
              <button type="button" onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-700"><X className="size-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-600">결재 유형</label>
                <select className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                  value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  {APPROVAL_TYPES.map((t) => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
                </select>
              </div>

              {form.type === "expense" && (
                <div>
                  <label className="text-xs font-medium text-slate-600">간단 정산 템플릿 불러오기</label>
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                    value={selectedTemplateId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setSelectedTemplateId("");
                      if (!id) return;
                      const t = templateList.find((x) => x.id === id) ?? null;
                      if (t) loadTemplateIntoForm(t);
                    }}
                  >
                    <option value="">--템플릿 선택--</option>
                    {templateList.map((t) => (
                      <option key={t.id} value={t.id}>{t.title || t.name || "(제목 없음)"}</option>
                    ))}
                  </select>
                </div>
              )}

              {form.type === "purchase" && (
                <div>
                  <label className="text-xs font-medium text-slate-600">비품구입 템플릿 불러오기</label>
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                    value={selectedPurchaseTemplateId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setSelectedPurchaseTemplateId("");
                      if (!id) return;
                      const t = purchaseTemplateList.find((x) => x.id === id) ?? null;
                      if (t) loadPurchaseTemplateIntoForm(t);
                    }}
                  >
                    <option value="">--템플릿 선택--</option>
                    {purchaseTemplateList.map((t) => (
                      <option key={t.id} value={t.id}>{t.title || t.item_name || t.name || "(제목 없음)"}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-slate-600">원장 기록 날짜</label>
                <input type="date" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                  value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-600">원장 카테고리</label>
                <select className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                  value={form.ledger_category} onChange={(e) => setForm({ ...form, ledger_category: e.target.value })}>
                  <option value="">선택 (미선택 시 원장에서 수동 지정)</option>
                  {LEDGER_CATEGORY_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-600">제목 *</label>
                <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                  value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={form.type === "purchase" ? "비품구입 제목" : "결재 제목"} />
              </div>

              {form.type === "expense" && (
                <>
                  <div>
                    <label className="text-xs font-medium text-slate-600">요청자</label>
                    <div className="mt-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">{currentUserName}</div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600">결제 사유</label>
                    <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                      value={form.payment_reason} onChange={(e) => setForm({ ...form, payment_reason: e.target.value })} placeholder="결제 사유" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600">시트 분류</label>
                    <select className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                      value={form.sheet_classification} onChange={(e) => setForm({ ...form, sheet_classification: e.target.value })}>
                      <option value="">선택</option>
                      {SETTLEMENT_SHEET_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600">금액 (원)</label>
                    <input type="text" inputMode="numeric" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none tabular-nums"
                      value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/[^0-9]/g, "") })} placeholder="0" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600">은행</label>
                    <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                      value={form.bank} onChange={(e) => setForm({ ...form, bank: e.target.value })} placeholder="은행명" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600">계좌번호</label>
                    <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                      value={form.account_number} onChange={(e) => setForm({ ...form, account_number: e.target.value })} placeholder="계좌번호" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600">예금주명</label>
                    <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                      value={form.account_holder_name} onChange={(e) => setForm({ ...form, account_holder_name: e.target.value })} placeholder="예금주명" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600">첨부자료 (선택)</label>
                    <p className="mt-0.5 text-[10px] text-slate-400 mb-1">환불내역서, 세금계산서, 통장사본 등</p>
                    <input
                      type="file"
                      multiple
                      accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.xlsx,.xls,.doc,.docx"
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none file:mr-2 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:text-xs file:font-medium"
                      onChange={(e) => {
                        const MAX_SIZE = 10 * 1024 * 1024; // 10MB
                        const ALLOWED = new Set([
                          "application/pdf","image/jpeg","image/png","image/gif","image/webp",
                          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                          "application/vnd.ms-excel",
                          "application/msword",
                          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                        ]);
                        const files = e.target.files ? Array.from(e.target.files) : [];
                        const oversized = files.filter((f) => f.size > MAX_SIZE);
                        const invalid = files.filter((f) => !ALLOWED.has(f.type));
                        if (oversized.length > 0) {
                          alert(`파일 크기는 10MB 이하만 첨부 가능합니다.\n(${oversized.map((f) => f.name).join(", ")})`);
                          e.target.value = "";
                          return;
                        }
                        if (invalid.length > 0) {
                          alert(`허용되지 않는 파일 형식입니다.\n(${invalid.map((f) => f.name).join(", ")})`);
                          e.target.value = "";
                          return;
                        }
                        setAttachmentFiles((prev) => [...prev, ...files]);
                        e.target.value = "";
                      }}
                    />
                    {attachmentFiles.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {attachmentFiles.map((f, i) => (
                          <li key={i} className="flex items-center justify-between rounded bg-slate-50 px-2 py-1.5 text-xs">
                            <span className="truncate text-slate-700">{f.name}</span>
                            <button type="button" onClick={() => setAttachmentFiles((p) => p.filter((_, j) => j !== i))} className="shrink-0 p-1 text-slate-400 hover:text-rose-500">
                              <Trash2 className="size-3.5" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <input className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                      value={form.attachment_note} onChange={(e) => setForm({ ...form, attachment_note: e.target.value })} placeholder="첨부 메모 (선택)" />
                    <button
                      type="button"
                      onClick={saveAsSimpleTemplate}
                      className="mt-2 w-full rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100"
                    >
                      💾 지금 입력한 내용을 템플릿으로 저장 (금액 제외, 이름 입력)
                    </button>
                  </div>
                </>
              )}

              {form.type === "purchase" && (
                <>
                  <div className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2">
                    <p className="text-xs font-semibold text-slate-600">&lt;구입정보&gt;</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600">구입처 URL</label>
                    <input type="url" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                      value={form.purchase_url} onChange={(e) => setForm({ ...form, purchase_url: e.target.value })} placeholder="https://..." />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-slate-600">아이디</label>
                      <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                        value={form.purchase_id} onChange={(e) => setForm({ ...form, purchase_id: e.target.value })} placeholder="사이트 아이디" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600">비밀번호</label>
                      <input type="password" autoComplete="off" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                        value={form.purchase_password} onChange={(e) => setForm({ ...form, purchase_password: e.target.value })} placeholder="사이트 비밀번호" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600">물품명</label>
                    <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                      value={form.item_name} onChange={(e) => setForm({ ...form, item_name: e.target.value })} placeholder="구입 물품명" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600">용도</label>
                    <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                      value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} placeholder="사용 용도" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600">금액 (원)</label>
                    <input type="text" inputMode="numeric" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none tabular-nums"
                      value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/[^0-9]/g, "") })} placeholder="0" />
                  </div>
                  <button
                    type="button"
                    onClick={saveAsPurchaseTemplate}
                    className="w-full rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100"
                  >
                    💾 지금 입력한 내용을 비품구입 템플릿으로 저장 (금액 제외)
                  </button>
                </>
              )}

              {form.type === "invoice" && (
                <>
                  <div className="relative">
                    <label className="text-xs font-medium text-slate-600">상호명 *</label>
                    <input
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                      value={form.invoice_company}
                      onChange={(e) => {
                        setForm({ ...form, invoice_company: e.target.value });
                        setShowInvoiceClientDrop(e.target.value.length > 0);
                      }}
                      onBlur={() => setTimeout(() => setShowInvoiceClientDrop(false), 150)}
                      placeholder="상호명 입력 또는 검색"
                    />
                    {showInvoiceClientDrop && (() => {
                      const q = form.invoice_company.trim().toLowerCase();
                      const matches = invoiceClients.filter((c) =>
                        c.name.toLowerCase().includes(q) || (c.aliases ?? []).some((a) => a.toLowerCase().includes(q))
                      ).slice(0, 8);
                      return matches.length > 0 ? (
                        <ul className="absolute left-0 top-full z-30 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
                          {matches.map((c) => (
                            <li key={c.id}>
                              <button
                                type="button"
                                className="w-full px-3 py-2 text-left text-sm hover:bg-blue-50"
                                onMouseDown={() => {
                                  setForm((prev) => ({
                                    ...prev,
                                    invoice_company: c.name,
                                    invoice_representative: c.representative ?? "",
                                    invoice_business_number: c.business_number ?? "",
                                    invoice_address: c.address ?? "",
                                    invoice_business_type: c.business_type ?? "",
                                    invoice_business_item: c.business_item ?? "",
                                    invoice_depositor: (c.aliases ?? [])[0] ?? c.name,
                                    invoice_tax_email: c.email ?? "",
                                  }));
                                  setShowInvoiceClientDrop(false);
                                }}
                              >
                                <span className="font-medium">{c.name}</span>
                                {c.business_number && <span className="ml-2 text-xs text-slate-400">{c.business_number}</span>}
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : null;
                    })()}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-slate-600">대표명</label>
                      <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                        value={form.invoice_representative} onChange={(e) => setForm({ ...form, invoice_representative: e.target.value })} placeholder="대표자명" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600">사업자등록번호</label>
                      <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                        value={form.invoice_business_number} onChange={(e) => setForm({ ...form, invoice_business_number: e.target.value })} placeholder="000-00-00000" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600">주소</label>
                    <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                      value={form.invoice_address} onChange={(e) => setForm({ ...form, invoice_address: e.target.value })} placeholder="사업장 주소" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-slate-600">업태</label>
                      <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                        value={form.invoice_business_type} onChange={(e) => setForm({ ...form, invoice_business_type: e.target.value })} placeholder="서비스업" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600">종목</label>
                      <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                        value={form.invoice_business_item} onChange={(e) => setForm({ ...form, invoice_business_item: e.target.value })} placeholder="IT서비스" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-slate-600">입금자명</label>
                      <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                        value={form.invoice_depositor} onChange={(e) => setForm({ ...form, invoice_depositor: e.target.value })} placeholder="입금자명 (SMS 매칭용)" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600">세금계산서 이메일</label>
                      <input type="email" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                        value={form.invoice_tax_email} onChange={(e) => setForm({ ...form, invoice_tax_email: e.target.value })} placeholder="tax@example.com" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600">품목</label>
                    <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                      value={form.invoice_item} onChange={(e) => setForm({ ...form, invoice_item: e.target.value })} placeholder="청구 품목명" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600">금액 (원) *</label>
                    <input type="text" inputMode="numeric" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none tabular-nums"
                      value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/[^0-9]/g, "") })} placeholder="0" />
                  </div>
                  <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                    💡 신청 시 박재민님께 알림이 발송됩니다. 입금 확인 시 원장에 자동 등록됩니다.
                  </div>
                </>
              )}

              {form.type === "etc" && (
                <>
                  <div>
                    <label className="text-xs font-medium text-slate-600">내용</label>
                    <textarea rows={4} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none resize-none"
                      value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="신청 사유 및 내용을 입력하세요" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600">금액 (원)</label>
                    <input type="text" inputMode="numeric" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                      value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/[^0-9]/g, "") })} placeholder="0" />
                  </div>
                </>
              )}

            </div>
            <div className="shrink-0 border-t border-slate-100 px-6 py-4 flex justify-end gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">취소</button>
              <button type="button" onClick={submitForm} disabled={(form.type === "invoice" ? !form.invoice_company.trim() || !form.amount : !form.title.trim()) || uploading} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40">
                {uploading ? "업로드 중…" : "신청"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 간단 정산 템플릿 관리 모달 (비품구입 템플릿과 동일한 방식: 목록 + 이름 수정/삭제만) */}
      {showTemplateManage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setShowTemplateManage(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="text-lg font-bold text-slate-900">간단 정산 템플릿 관리</h2>
              <button type="button" onClick={() => setShowTemplateManage(false)} className="text-slate-400 hover:text-slate-700"><X className="size-5" /></button>
            </div>
            <div className="px-5 py-3 border-b border-slate-100">
              <p className="text-xs text-slate-500 text-center">등록한 템플릿은 결재 신청 시 정산요청 유형에서 불러오기로 사용할 수 있습니다.</p>
            </div>
            <div className="max-h-[50vh] overflow-y-auto px-5 py-4">
              {templateList.length === 0 ? (
                <p className="text-sm text-slate-500 py-6 text-center">등록된 간단 정산 템플릿이 없습니다.<br />결재 신청 → 정산요청 선택 후 &#39;템플릿으로 저장&#39;으로 추가하세요.</p>
              ) : (
                <ul className="space-y-2">
                  {templateList.map((t) => (
                    <li key={t.id} className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50/50 p-3">
                      <div className="flex-1 min-w-0">
                        {editingTemplateName?.id === t.id ? (
                          <div className="flex gap-2">
                            <input
                              type="text"
                              className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                              value={editingTemplateName.name}
                              onChange={(e) => setEditingTemplateName({ id: t.id, name: e.target.value })}
                              autoFocus
                            />
                            <button type="button" onClick={() => handleSaveTemplateName(t.id, editingTemplateName.name)} className="rounded bg-blue-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-blue-700">저장</button>
                            <button type="button" onClick={() => setEditingTemplateName(null)} className="rounded border px-2 py-1.5 text-xs text-slate-600">취소</button>
                          </div>
                        ) : (
                          <>
                            <p className="font-medium text-slate-800 truncate">{t.name}</p>
                            <p className="text-xs text-slate-500 truncate">{t.title || "(제목 없음)"}</p>
                          </>
                        )}
                      </div>
                      {editingTemplateName?.id !== t.id && (
                        <div className="flex shrink-0 gap-1">
                          <button type="button" onClick={() => setEditingTemplateName({ id: t.id, name: t.name })} className="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-50">이름 수정</button>
                          <button type="button" onClick={() => handleDeleteTemplate(t.id)} className="rounded border border-rose-200 bg-white px-2 py-1 text-xs text-rose-600 hover:bg-rose-50">삭제</button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 비품구입 템플릿 관리 모달 */}
      {showPurchaseTemplateManage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setShowPurchaseTemplateManage(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="text-lg font-bold text-slate-900">비품구입 템플릿 관리</h2>
              <button type="button" onClick={() => setShowPurchaseTemplateManage(false)} className="text-slate-400 hover:text-slate-700"><X className="size-5" /></button>
            </div>
            <div className="px-5 py-3 border-b border-slate-100">
              <p className="text-xs text-slate-500 text-center">등록한 템플릿은 결재 신청 시 비품구입 유형에서 불러오기로 사용할 수 있습니다.</p>
            </div>
            <div className="max-h-[50vh] overflow-y-auto px-5 py-4">
              {purchaseTemplateList.length === 0 ? (
                <p className="text-sm text-slate-500 py-6 text-center">등록된 비품구입 템플릿이 없습니다.<br />결재 신청 → 비품구입 선택 후 &#39;템플릿으로 저장&#39;으로 추가하세요.</p>
              ) : (
                <ul className="space-y-2">
                  {purchaseTemplateList.map((t) => (
                    <li key={t.id} className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50/50 p-3">
                      <div className="flex-1 min-w-0">
                        {editingPurchaseTemplateName?.id === t.id ? (
                          <div className="flex gap-2">
                            <input
                              type="text"
                              className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                              value={editingPurchaseTemplateName.name}
                              onChange={(e) => setEditingPurchaseTemplateName({ id: t.id, name: e.target.value })}
                              autoFocus
                            />
                            <button type="button" onClick={() => handleSavePurchaseTemplateName(t.id, editingPurchaseTemplateName.name)} className="rounded bg-blue-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-blue-700">저장</button>
                            <button type="button" onClick={() => setEditingPurchaseTemplateName(null)} className="rounded border px-2 py-1.5 text-xs text-slate-600">취소</button>
                          </div>
                        ) : (
                          <>
                            <p className="font-medium text-slate-800 truncate">{t.name}</p>
                            <p className="text-xs text-slate-500 truncate">{t.title || t.item_name || "(제목 없음)"}</p>
                          </>
                        )}
                      </div>
                      {editingPurchaseTemplateName?.id !== t.id && (
                        <div className="flex shrink-0 gap-1">
                          <button type="button" onClick={() => setEditingPurchaseTemplateName({ id: t.id, name: t.name })} className="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-50">이름 수정</button>
                          <button type="button" onClick={() => handleDeletePurchaseTemplate(t.id)} className="rounded border border-rose-200 bg-white px-2 py-1 text-xs text-rose-600 hover:bg-rose-50">삭제</button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 상세 / 결재 처리 모달 */}
      {detailItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { setDetailItem(null); setShowRejectInput(false); }}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">{detailItem.title}</h2>
              <button type="button" onClick={() => setDetailItem(null)} className="text-slate-400 hover:text-slate-700"><X className="size-5" /></button>
            </div>
            <div className="space-y-2 rounded-xl bg-slate-50 p-4 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">요청자</span><span className="font-medium">{detailItem.requester_name}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">신청일</span><span>{format(parseISO(detailItem.created_at), "yyyy.MM.dd HH:mm", { locale: ko })}</span></div>
              {detailItem.ledger_category && <div className="flex justify-between"><span className="text-slate-500">원장 카테고리</span><span className="font-medium text-blue-700">{detailItem.ledger_category}</span></div>}
              {detailItem.type === "expense" && (
                <>
                  {detailItem.payment_reason && <div className="flex justify-between"><span className="text-slate-500">결제 사유</span><span>{detailItem.payment_reason}</span></div>}
                  {detailItem.sheet_classification && <div className="flex justify-between"><span className="text-slate-500">시트 분류</span><span>{detailItem.sheet_classification}</span></div>}
                  {detailItem.amount != null && <div className="flex justify-between"><span className="text-slate-500">금액</span><span className="font-semibold">{Number(detailItem.amount).toLocaleString()}원</span></div>}
                  {detailItem.bank && <div className="flex justify-between"><span className="text-slate-500">은행</span><span>{detailItem.bank}</span></div>}
                  {detailItem.account_number && <div className="flex justify-between"><span className="text-slate-500">계좌번호</span><span>{detailItem.account_number}</span></div>}
                  {detailItem.account_holder_name && <div className="flex justify-between"><span className="text-slate-500">예금주명</span><span>{detailItem.account_holder_name}</span></div>}
                  {detailItem.attachment_note && (
                    <div className="flex flex-col gap-0.5">
                      <span className="text-slate-500">첨부자료</span>
                      <div className="flex flex-col gap-1 text-sm break-all">
                        {detailItem.attachment_note.split(/\r?\n/).map((line, i) =>
                          /^https?:\/\//i.test(line.trim()) ? (
                            <a key={i} href={line.trim()} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                              {line.trim()}
                            </a>
                          ) : (
                            <span key={i}>{line}</span>
                          )
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
              {detailItem.type === "purchase" && (
                <>
                  {detailItem.purchase_url && (
                    <div className="flex flex-col gap-0.5">
                      <span className="text-slate-500">구입처 URL</span>
                      <a href={detailItem.purchase_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all text-sm">{detailItem.purchase_url}</a>
                    </div>
                  )}
                  {detailItem.purchase_id && <div className="flex justify-between"><span className="text-slate-500">아이디</span><span>{detailItem.purchase_id}</span></div>}
                  {detailItem.purchase_password && <div className="flex justify-between"><span className="text-slate-500">비밀번호</span><span className="font-mono text-sm">{detailItem.purchase_password}</span></div>}
                  {detailItem.item_name && <div className="flex justify-between"><span className="text-slate-500">물품명</span><span>{detailItem.item_name}</span></div>}
                  {detailItem.purpose && <div className="flex justify-between"><span className="text-slate-500">용도</span><span>{detailItem.purpose}</span></div>}
                  {detailItem.amount != null && <div className="flex justify-between"><span className="text-slate-500">금액</span><span className="font-semibold">{Number(detailItem.amount).toLocaleString()}원</span></div>}
                </>
              )}
              {detailItem.type === "invoice" && (() => {
                let inv: Record<string, string> = {};
                try { inv = detailItem.content ? JSON.parse(detailItem.content) : {}; } catch { /* ignore */ }
                return (
                  <>
                    {detailItem.amount != null && <div className="flex justify-between"><span className="text-slate-500">금액</span><span className="font-semibold">{Number(detailItem.amount).toLocaleString()}원</span></div>}
                    {inv.company_name && <div className="flex justify-between"><span className="text-slate-500">상호명</span><span>{inv.company_name}</span></div>}
                    {inv.representative && <div className="flex justify-between"><span className="text-slate-500">대표명</span><span>{inv.representative}</span></div>}
                    {inv.business_number && <div className="flex justify-between"><span className="text-slate-500">사업자번호</span><span>{inv.business_number}</span></div>}
                    {inv.address && <div className="flex justify-between"><span className="text-slate-500">주소</span><span className="text-right max-w-[60%]">{inv.address}</span></div>}
                    {inv.business_type && <div className="flex justify-between"><span className="text-slate-500">업태</span><span>{inv.business_type}</span></div>}
                    {inv.business_item && <div className="flex justify-between"><span className="text-slate-500">종목</span><span>{inv.business_item}</span></div>}
                    {inv.depositor_name && <div className="flex justify-between"><span className="text-slate-500">입금자명</span><span>{inv.depositor_name}</span></div>}
                    {inv.tax_email && <div className="flex justify-between"><span className="text-slate-500">세금계산서 이메일</span><span>{inv.tax_email}</span></div>}
                    {inv.item_name && <div className="flex justify-between"><span className="text-slate-500">품목</span><span>{inv.item_name}</span></div>}
                  </>
                );
              })()}
              {detailItem.type === "etc" && (
                <>
                  {detailItem.amount != null && <div className="flex justify-between"><span className="text-slate-500">금액</span><span className="font-semibold">{Number(detailItem.amount).toLocaleString()}원</span></div>}
                  {detailItem.start_date && <div className="flex justify-between"><span className="text-slate-500">기간</span><span>{detailItem.start_date}{detailItem.end_date ? ` ~ ${detailItem.end_date}` : ""}</span></div>}
                </>
              )}
              <div className="flex justify-between"><span className="text-slate-500">상태</span>
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", STATUS_CONFIG[detailItem.status].cls)}>
                  {STATUS_CONFIG[detailItem.status].label}
                </span>
              </div>
              {/* 결재선 */}
              <div className="mt-1 rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3">
                <p className="mb-2 text-xs font-semibold text-slate-500">결재선</p>
                <div className="flex items-center gap-2 text-xs">
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-blue-700 font-medium">{detailItem.requester_name}</span>
                  <span className="text-slate-400">→</span>
                  <span className={`rounded-full px-2 py-0.5 font-medium ${detailItem.status !== "pending" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                    박재민 (팀장)
                  </span>
                  {detailItem.status !== "pending" && (
                    <>
                      <span className="text-slate-400">→</span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600 font-medium">C레벨 기록됨</span>
                    </>
                  )}
                </div>
              </div>
              {detailItem.approver_name && <div className="flex justify-between"><span className="text-slate-500">결재자</span><span>{detailItem.approver_name}</span></div>}
              {detailItem.reject_reason && (
                <div className="mt-1 rounded-lg bg-rose-50 p-2.5 text-xs text-rose-700">
                  반려 사유: {detailItem.reject_reason}
                </div>
              )}
            </div>
            {detailItem.content && (
              <div className="mt-3 rounded-xl border border-slate-100 p-4 text-sm text-slate-700 whitespace-pre-wrap">
                {detailItem.content}
              </div>
            )}

            {/* 매출매입 연동 현황 */}
            {(detailItem.type === "expense" || detailItem.type === "purchase") && detailItem.amount != null && Number(detailItem.amount) > 0 && (
              <div className={`mt-3 flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium ${
                detailItem.status === "approved"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-amber-200 bg-amber-50 text-amber-700"
              }`}>
                <span>{detailItem.status === "approved" ? "✅" : "⏳"}</span>
                <span>
                  매출매입 원장 {detailItem.status === "approved" ? "승인 완료" : "미승인 매입으로 대기 중"}
                  {" · "}{Number(detailItem.amount).toLocaleString()}원
                </span>
                <a href="/finance" className="ml-auto text-blue-600 hover:underline">원장 보기 →</a>
              </div>
            )}

            {/* 재신청 버튼 (반려된 본인 결재) */}
            {detailItem.status === "rejected" && detailItem.requester_id === currentUserId && (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => openReapplyForm(detailItem)}
                  className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  재신청
                </button>
              </div>
            )}

            {/* 결재 버튼 (권한자만) */}
            {canApprove && detailItem.status === "pending" && (
              <div className="mt-4 space-y-2">
                {!showRejectInput ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => updateStatus(detailItem.id, "approved")}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
                    >
                      <Check className="size-4" /> 결재 완료 (매입 승인)
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowRejectInput(true)}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-rose-50 py-2.5 text-sm font-semibold text-rose-600 hover:bg-rose-100 border border-rose-200"
                    >
                      <X className="size-4" /> 반려
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <input className="w-full rounded-lg border border-rose-200 px-3 py-2 text-sm focus:border-rose-400 focus:outline-none"
                      placeholder="반려 사유를 입력하세요"
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setShowRejectInput(false)} className="flex-1 rounded-xl border py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">취소</button>
                      <button type="button" onClick={() => updateStatus(detailItem.id, "rejected", rejectReason)}
                        className="flex-1 rounded-xl bg-rose-600 py-2 text-sm font-semibold text-white hover:bg-rose-700">반려 처리</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 삭제 버튼 (본인 / C레벨 / 마스터) */}
            {(detailItem.requester_id === currentUserId || isCLevel || isMaster) && (
              <div className="mt-4 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => handleDeleteApproval(detailItem.id)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-white py-2 text-sm font-medium text-rose-600 hover:bg-rose-50"
                >
                  <Trash2 className="size-4" /> 결재 내역 삭제
                </button>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
}
