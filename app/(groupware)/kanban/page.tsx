"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Plus, X, GripVertical, Loader2, MessageSquare, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePermission } from "@/contexts/PermissionContext";

// ─── 타입 ──────────────────────────────────────────────────────────────────────
type KanbanCard = {
  id: string;
  title: string;
  description?: string;
  column: string;
  position: number;
  assignee?: string;
  priority?: "high" | "medium" | "low";
  due_date?: string;
  created_at?: string;
};

// ─── 컬럼 정의 ─────────────────────────────────────────────────────────────────
const COLUMNS = [
  { id: "todo",        label: "할 일",    color: "bg-slate-100 text-slate-700",   dot: "bg-slate-400" },
  { id: "in_progress", label: "진행 중",  color: "bg-blue-100 text-blue-700",     dot: "bg-blue-500" },
  { id: "review",      label: "검토 중",  color: "bg-amber-100 text-amber-700",   dot: "bg-amber-500" },
  { id: "done",        label: "완료",     color: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
];

const PRIORITY_STYLE = {
  high:   "bg-red-100 text-red-600",
  medium: "bg-amber-100 text-amber-600",
  low:    "bg-slate-100 text-slate-500",
};
const PRIORITY_LABEL = { high: "높음", medium: "보통", low: "낮음" };

// ─── 마감일 상태 계산 ─────────────────────────────────────────────────────────
function getDueDateStatus(due_date?: string): "overdue" | "today" | "normal" | null {
  if (!due_date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(due_date);
  due.setHours(0, 0, 0, 0);
  if (due < today) return "overdue";
  if (due.getTime() === today.getTime()) return "today";
  return "normal";
}

// ─── 카드 컴포넌트 ─────────────────────────────────────────────────────────────
function KanbanCardItem({
  card,
  onDelete,
  onEdit,
  onDragStart,
}: {
  card: KanbanCard;
  onDelete: (id: string) => void;
  onEdit: (card: KanbanCard) => void;
  onDragStart: (card: KanbanCard) => void;
}) {
  const dueDateStatus = getDueDateStatus(card.due_date);
  const isOverdue = dueDateStatus === "overdue" && card.column !== "done";
  const isDueToday = dueDateStatus === "today" && card.column !== "done";

  return (
    <div
      draggable
      onDragStart={() => onDragStart(card)}
      className={cn(
        "group relative cursor-grab rounded-xl border p-3.5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md active:cursor-grabbing",
        isOverdue ? "border-red-200 bg-red-50/60" : isDueToday ? "border-amber-200 bg-amber-50/60" : "border-slate-100 bg-white"
      )}
      onClick={() => onEdit(card)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-800 leading-snug">{card.title}</p>
          {card.description && (
            <p className="mt-1 text-xs text-slate-500 line-clamp-2">{card.description}</p>
          )}
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(card.id); }}
          className="shrink-0 opacity-0 group-hover:opacity-100 text-slate-300 hover:text-rose-500 transition-all"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {card.priority && (
          <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", PRIORITY_STYLE[card.priority])}>
            {PRIORITY_LABEL[card.priority]}
          </span>
        )}
        {card.assignee && (
          <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600">
            {card.assignee}
          </span>
        )}
        {card.due_date && (
          <span className={cn(
            "ml-auto text-[10px] font-medium",
            isOverdue ? "text-red-500" : isDueToday ? "text-amber-500" : "text-slate-400"
          )}>
            {isOverdue && "⚠ "}{card.due_date}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── 메인 ─────────────────────────────────────────────────────────────────────
export default function KanbanPage() {
  const { currentUserName } = usePermission();
  const [cards, setCards] = useState<KanbanCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragging, setDragging] = useState<KanbanCard | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [editCard, setEditCard] = useState<KanbanCard | null>(null);
  const [addingCol, setAddingCol] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [tableMissingMessage, setTableMissingMessage] = useState<string | null>(null);
  const [newMemo, setNewMemo] = useState("");
  const addInputRef = useRef<HTMLInputElement>(null);

  const fetchCards = useCallback(async () => {
    setLoading(true);
    setTableMissingMessage(null);
    try {
      const res = await fetch("/api/kanban");
      const data = await res.json();
      if (res.status === 503 && (data as { code?: string }).code === "KANBAN_TABLE_MISSING") {
        setTableMissingMessage((data as { error?: string }).error ?? "kanban_cards 테이블을 생성해 주세요.");
        setCards([]);
      } else if (res.ok && Array.isArray(data)) {
        setCards(data);
      } else {
        setCards([]);
      }
    } catch {
      setCards([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCards(); }, [fetchCards]);

  useEffect(() => {
    if (addingCol) setTimeout(() => addInputRef.current?.focus(), 50);
  }, [addingCol]);

  const addCard = async (col: string) => {
    const title = newTitle.trim();
    if (!title) return;
    const colCards = cards.filter((c) => c.column === col);
    const position = colCards.length;
    const res = await fetch("/api/kanban", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, column: col, position, assignee: currentUserName }),
    });
    if (res.ok) {
      const card = await res.json();
      setCards((prev) => [...prev, card]);
    }
    setNewTitle("");
    setAddingCol(null);
  };

  const deleteCard = async (id: string) => {
    setCards((prev) => prev.filter((c) => c.id !== id));
    await fetch(`/api/kanban/${id}`, { method: "DELETE" });
  };

  const moveCard = async (cardId: string, toCol: string) => {
    const colCards = cards.filter((c) => c.column === toCol);
    const position = colCards.length;
    setCards((prev) =>
      prev.map((c) => (c.id === cardId ? { ...c, column: toCol, position } : c))
    );
    await fetch(`/api/kanban/${cardId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ column: toCol, position }),
    });
  };

  const saveEdit = async () => {
    if (!editCard) return;
    setCards((prev) => prev.map((c) => (c.id === editCard.id ? editCard : c)));
    await fetch(`/api/kanban/${editCard.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: editCard.title,
        description: editCard.description,
        priority: editCard.priority,
        assignee: editCard.assignee,
        due_date: editCard.due_date,
      }),
    });
    setEditCard(null);
  };

  const addMemo = async () => {
    if (!editCard || !newMemo.trim()) return;
    const now = new Date();
    const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const memoLine = `[${ts} ${currentUserName}] ${newMemo.trim()}`;
    const newDesc = editCard.description ? `${editCard.description}\n${memoLine}` : memoLine;
    const updated = { ...editCard, description: newDesc };
    setEditCard(updated);
    setNewMemo("");
    setCards((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    await fetch(`/api/kanban/${updated.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: newDesc }),
    });
  };

  return (
    <div className="flex flex-col gap-6 min-h-full">
      {/* 헤더 */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">칸반 보드</h1>
        <p className="mt-1 text-sm text-slate-500">팀 업무를 드래그로 관리하세요</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="size-6 animate-spin text-slate-400" />
        </div>
      ) : tableMissingMessage ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center text-amber-800">
          <p className="font-medium">칸반 보드를 사용하려면 DB 설정이 필요합니다.</p>
          <p className="mt-2 text-sm">{tableMissingMessage}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((col) => {
            const colCards = cards
              .filter((c) => c.column === col.id)
              .sort((a, b) => a.position - b.position);
            return (
              <div
                key={col.id}
                className={cn(
                  "flex flex-col rounded-2xl border-2 transition-colors",
                  dragOverCol === col.id ? "border-blue-300 bg-blue-50/50" : "border-transparent bg-slate-50/80"
                )}
                onDragOver={(e) => { e.preventDefault(); setDragOverCol(col.id); }}
                onDragLeave={() => setDragOverCol(null)}
                onDrop={() => {
                  if (dragging && dragging.column !== col.id) moveCard(dragging.id, col.id);
                  setDragging(null);
                  setDragOverCol(null);
                }}
              >
                {/* 컬럼 헤더 */}
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className={cn("size-2 rounded-full", col.dot)} />
                    <span className="text-sm font-semibold text-slate-700">{col.label}</span>
                    <span className="rounded-full bg-slate-200/80 px-2 py-0.5 text-xs font-semibold text-slate-600 tabular-nums">
                      {colCards.length}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setAddingCol(col.id); setNewTitle(""); }}
                    className="flex size-6 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-colors"
                  >
                    <Plus className="size-4" />
                  </button>
                </div>

                {/* 카드 목록 */}
                <div className="flex flex-col gap-2 px-3 pb-3 min-h-[4rem]">
                  {colCards.map((card) => (
                    <KanbanCardItem
                      key={card.id}
                      card={card}
                      onDelete={deleteCard}
                      onEdit={setEditCard}
                      onDragStart={setDragging}
                    />
                  ))}

                  {/* 새 카드 입력 */}
                  {addingCol === col.id && (
                    <div className="rounded-xl border border-blue-200 bg-white p-3 shadow-sm">
                      <input
                        ref={addInputRef}
                        className="w-full text-sm text-slate-800 outline-none placeholder:text-slate-400"
                        placeholder="카드 제목 입력..."
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") addCard(col.id);
                          if (e.key === "Escape") setAddingCol(null);
                        }}
                      />
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => addCard(col.id)}
                          disabled={!newTitle.trim()}
                          className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-40"
                        >
                          추가
                        </button>
                        <button
                          type="button"
                          onClick={() => setAddingCol(null)}
                          className="rounded-lg px-3 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100"
                        >
                          취소
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 카드 편집 모달 */}
      {editCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { setEditCard(null); setNewMemo(""); }}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">카드 수정</h2>
              <button type="button" onClick={() => { setEditCard(null); setNewMemo(""); }} className="text-slate-400 hover:text-slate-700">
                <X className="size-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-600">제목</label>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                  value={editCard.title}
                  onChange={(e) => setEditCard({ ...editCard, title: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">설명</label>
                <textarea
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none resize-none"
                  value={editCard.description ?? ""}
                  onChange={(e) => setEditCard({ ...editCard, description: e.target.value })}
                />
              </div>

              {/* 메모 영역 */}
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <MessageSquare className="size-3.5 text-slate-400" />
                  <span className="text-xs font-medium text-slate-600">메모</span>
                </div>
                {editCard.description && editCard.description.split("\n").some((l) => l.startsWith("[")) && (
                  <div className="mb-2 space-y-1.5 rounded-lg bg-slate-50 p-2.5">
                    {editCard.description.split("\n").filter((l) => l.startsWith("[")).map((line, i) => {
                      const match = line.match(/^\[([^\]]+)\]\s(.+)/);
                      return match ? (
                        <div key={i} className="text-xs">
                          <span className="text-slate-400">{match[1]}</span>
                          <span className="ml-1 text-slate-700">{match[2]}</span>
                        </div>
                      ) : <div key={i} className="text-xs text-slate-600">{line}</div>;
                    })}
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                    placeholder="메모 입력 후 Enter..."
                    value={newMemo}
                    onChange={(e) => setNewMemo(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addMemo(); } }}
                  />
                  <button
                    type="button"
                    onClick={addMemo}
                    disabled={!newMemo.trim()}
                    className="flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-200 disabled:opacity-40"
                  >
                    <Send className="size-3.5" />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600">담당자</label>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                    value={editCard.assignee ?? ""}
                    onChange={(e) => setEditCard({ ...editCard, assignee: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">마감일</label>
                  <input
                    type="date"
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                    value={editCard.due_date ?? ""}
                    onChange={(e) => setEditCard({ ...editCard, due_date: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">우선순위</label>
                <select
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                  value={editCard.priority ?? ""}
                  onChange={(e) => setEditCard({ ...editCard, priority: e.target.value as KanbanCard["priority"] })}
                >
                  <option value="">선택 안 함</option>
                  <option value="high">높음</option>
                  <option value="medium">보통</option>
                  <option value="low">낮음</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">컬럼 이동</label>
                <select
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                  value={editCard.column}
                  onChange={(e) => setEditCard({ ...editCard, column: e.target.value })}
                >
                  {COLUMNS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => { setEditCard(null); setNewMemo(""); }} className="rounded-lg border px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">취소</button>
              <button type="button" onClick={saveEdit} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">저장</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
