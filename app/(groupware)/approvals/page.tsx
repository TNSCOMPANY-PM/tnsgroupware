"use client";

import { useState, useEffect, useCallback } from "react";
import { format, parseISO } from "date-fns";
import { ko } from "date-fns/locale";
import { Plus, X, Check, ChevronDown, Loader2, FileText, Clock, CheckCircle2, XCircle } from "lucide-react";
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
};

const APPROVAL_TYPES = [
  { value: "leave",    label: "휴가 신청",   icon: "🌴" },
  { value: "expense",  label: "지출 결의",   icon: "💳" },
  { value: "overtime", label: "초과근무",    icon: "⏰" },
  { value: "purchase", label: "구매 요청",   icon: "🛒" },
  { value: "etc",      label: "기타",        icon: "📄" },
];

const STATUS_CONFIG = {
  pending:  { label: "승인 대기", icon: Clock,          cls: "bg-amber-100 text-amber-700" },
  approved: { label: "승인 완료", icon: CheckCircle2,   cls: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "반려",      icon: XCircle,        cls: "bg-rose-100 text-rose-700" },
};

const TABS = [
  { id: "all",      label: "전체" },
  { id: "pending",  label: "대기" },
  { id: "approved", label: "완료" },
  { id: "rejected", label: "반려" },
  { id: "mine",     label: "내 결재" },
];

export default function ApprovalsPage() {
  const { currentUserId, currentUserName, isCLevel, isTeamLead } = usePermission();
  const canApprove = isCLevel || isTeamLead;

  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [detailItem, setDetailItem] = useState<Approval | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);

  // 폼
  const [form, setForm] = useState({
    type: "leave", title: "", content: "", amount: "", start_date: "", end_date: "",
  });

  const fetchApprovals = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/approvals");
    if (res.ok) setApprovals(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetchApprovals(); }, [fetchApprovals]);

  const submitForm = async () => {
    if (!form.title.trim()) return;
    const typeObj = APPROVAL_TYPES.find((t) => t.value === form.type);
    const res = await fetch("/api/approvals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: form.type,
        title: `${typeObj?.icon ?? ""} ${form.title}`,
        content: form.content,
        requester_name: currentUserName,
        requester_id: currentUserId,
        amount: form.amount ? Number(form.amount) : null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
      }),
    });
    if (res.ok) {
      const created = await res.json();
      setApprovals((p) => [created, ...p]);
      setShowForm(false);
      setForm({ type: "leave", title: "", content: "", amount: "", start_date: "", end_date: "" });
    }
  };

  const updateStatus = async (id: string, status: "approved" | "rejected", reason?: string) => {
    const res = await fetch(`/api/approvals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status,
        approver_name: currentUserName,
        reviewed_at: new Date().toISOString(),
        ...(reason ? { reject_reason: reason } : {}),
      }),
    });
    if (res.ok) {
      const updated = await res.json();
      setApprovals((p) => p.map((a) => a.id === id ? updated : a));
      setDetailItem(updated);
      setShowRejectInput(false);
      setRejectReason("");
    }
  };

  const deleteApproval = async (id: string) => {
    if (!confirm("삭제할까요?")) return;
    await fetch(`/api/approvals/${id}`, { method: "DELETE" });
    setApprovals((p) => p.filter((a) => a.id !== id));
    setDetailItem(null);
  };

  const filtered = approvals.filter((a) => {
    if (tab === "mine") return a.requester_id === currentUserId;
    if (tab === "all") return true;
    return a.status === tab;
  });

  const pendingCount = approvals.filter((a) => a.status === "pending").length;

  return (
    <div className="flex flex-col gap-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">전자결재</h1>
          <p className="mt-0.5 text-sm text-slate-500">결재 문서를 작성하고 처리하세요</p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
        >
          <Plus className="size-4" /> 결재 신청
        </button>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
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
          {filtered.map((a) => {
            const statusCfg = STATUS_CONFIG[a.status];
            const StatusIcon = statusCfg.icon;
            return (
              <div
                key={a.id}
                onClick={() => setDetailItem(a)}
                className="flex cursor-pointer items-center gap-4 rounded-xl border border-slate-100 bg-white px-5 py-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800 truncate">{a.title}</p>
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

      {/* 신청 모달 */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowForm(false)}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">결재 신청</h2>
              <button type="button" onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-700"><X className="size-5" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-600">결재 유형</label>
                <select className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                  value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  {APPROVAL_TYPES.map((t) => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">제목 *</label>
                <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                  value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="결재 제목" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">내용</label>
                <textarea rows={4} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none resize-none"
                  value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="신청 사유 및 내용을 입력하세요" />
              </div>
              {(form.type === "leave" || form.type === "overtime") && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-600">시작일</label>
                    <input type="date" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                      value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600">종료일</label>
                    <input type="date" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                      value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
                  </div>
                </div>
              )}
              {(form.type === "expense" || form.type === "purchase") && (
                <div>
                  <label className="text-xs font-medium text-slate-600">금액 (원)</label>
                  <input type="number" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                    value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0" />
                </div>
              )}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">취소</button>
              <button type="button" onClick={submitForm} disabled={!form.title.trim()} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40">신청</button>
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
              <div className="flex justify-between"><span className="text-slate-500">신청자</span><span className="font-medium">{detailItem.requester_name}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">신청일</span><span>{format(parseISO(detailItem.created_at), "yyyy.MM.dd HH:mm", { locale: ko })}</span></div>
              {detailItem.amount && <div className="flex justify-between"><span className="text-slate-500">금액</span><span className="font-semibold">{detailItem.amount.toLocaleString()}원</span></div>}
              {detailItem.start_date && <div className="flex justify-between"><span className="text-slate-500">기간</span><span>{detailItem.start_date}{detailItem.end_date ? ` ~ ${detailItem.end_date}` : ""}</span></div>}
              <div className="flex justify-between"><span className="text-slate-500">상태</span>
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", STATUS_CONFIG[detailItem.status].cls)}>
                  {STATUS_CONFIG[detailItem.status].label}
                </span>
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
                      <Check className="size-4" /> 승인
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

            {/* 본인 삭제 (대기 중일 때만) */}
            {detailItem.requester_id === currentUserId && detailItem.status === "pending" && (
              <div className="mt-3 flex justify-end">
                <button type="button" onClick={() => deleteApproval(detailItem.id)} className="text-xs text-slate-400 hover:text-rose-500">신청 취소</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
